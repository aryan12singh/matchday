import type { Database } from '@matchday/domain';
import {
  DEADLINE_REMINDER,
  type PushTarget,
  configurePush,
  deadlineDedupeKey,
  deadlineReminder,
  isPushConfigured,
  sendPushToAll,
} from '@matchday/notify';
import type { SupabaseClient } from '@supabase/supabase-js';

import { withAdvisoryLock } from './locks';
import { runJob } from './sync-runs';

type Db = SupabaseClient<Database>;

/**
 * Deadline reminders — "you have three matches left and it locks in an hour".
 *
 * Only people who have actually left something unanswered are messaged. That rule is the
 * whole feature: a reminder sent to someone who already predicted is pure noise, and two
 * of those are enough for a person to turn notifications off for good, at which point the
 * one that mattered never arrives either.
 *
 * Idempotent through notification_log.dedupe_key, which is unique. Overlapping ticks, a
 * retry after a timeout, or a redeploy mid-run all end up inserting the same key and
 * losing the race — which is exactly the desired outcome, because the alternative is
 * buzzing someone twice.
 */

export interface ReminderResult {
  candidates: number;
  sent: number;
  skippedAlreadySent: number;
  skippedNoSubscription: number;
  expiredRemoved: number;
  failed: number;
}

/** Lead times a user can choose, in minutes. Defaults to an hour. */
const DEFAULT_LEAD_MINUTES = 60;

export async function sendDeadlineReminders(
  client: Db,
  options: { now?: number; env?: Record<string, string | undefined> } = {},
): Promise<ReminderResult | null> {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();

  const empty: ReminderResult = {
    candidates: 0,
    sent: 0,
    skippedAlreadySent: 0,
    skippedNoSubscription: 0,
    expiredRemoved: 0,
    failed: 0,
  };

  // Nothing configured is a normal state — local development, and any deployment before
  // the keys are set. Silence is correct; failing would make the whole tick red.
  if (!isPushConfigured(env)) return empty;

  configurePush({
    publicKey: env.VAPID_PUBLIC_KEY!,
    privateKey: env.VAPID_PRIVATE_KEY!,
    subject: env.VAPID_SUBJECT ?? 'mailto:hello@matchday.app',
  });

  return withAdvisoryLock(client, 'reminders:deadline', () =>
    runJob(client, 'send_deadline_reminders', 'tick', {}, async () => {
      const result = { ...empty };

      // Everyone who has asked for a push reminder, with their chosen lead time.
      const { data: prefs } = await client
        .from('notification_prefs')
        .select('user_id, config')
        .eq('type', DEADLINE_REMINDER)
        .eq('channel', 'push')
        .eq('enabled', true);

      if (!prefs || prefs.length === 0) {
        return { result, recordsWritten: 0 };
      }

      for (const pref of prefs) {
        const leadMinutes =
          Number((pref.config as { lead_minutes?: number } | null)?.lead_minutes) ||
          DEFAULT_LEAD_MINUTES;

        // The window is one minute wide because the tick runs every minute. Wider would
        // re-send on the following tick; narrower would miss the window entirely if a tick
        // were late, and a missed reminder is worse than a slightly early one.
        const windowStart = new Date(now + (leadMinutes - 1) * 60_000).toISOString();
        const windowEnd = new Date(now + leadMinutes * 60_000).toISOString();

        const { data: locking } = await client
          .from('fixtures')
          .select(
            'id, kickoff_at, round_id, rounds!fixtures_round_id_fkey ( id, number, stages!inner ( season_id ) )',
          )
          .gte('kickoff_at', windowStart)
          .lt('kickoff_at', windowEnd)
          .eq('status', 'scheduled')
          .order('kickoff_at', { ascending: true })
          .limit(1);

        const next = locking?.[0];
        if (!next) continue;

        const round = next.rounds as unknown as { id: string; number: number } | null;
        if (!round) continue;

        result.candidates += 1;

        // Already told this person about this matchweek at this lead time.
        const dedupeKey = deadlineDedupeKey(pref.user_id, round.id, leadMinutes);
        const { data: already } = await client
          .from('notification_log')
          .select('id')
          .eq('dedupe_key', dedupeKey)
          .maybeSingle();

        if (already) {
          result.skippedAlreadySent += 1;
          continue;
        }

        // How much of this matchweek they have left. Counting fixtures with no scoreline
        // prediction, because the scoreline is what makes a card complete.
        const { data: roundFixtures } = await client
          .from('fixtures')
          .select('id')
          .eq('round_id', round.id)
          .eq('status', 'scheduled');

        const fixtureIds = (roundFixtures ?? []).map((f) => f.id);
        if (fixtureIds.length === 0) continue;

        const { data: answered } = await client
          .from('predictions')
          .select('markets!inner ( fixture_id, market_types!inner ( code ) )')
          .eq('user_id', pref.user_id)
          .eq('markets.market_types.code', 'correct_score')
          .in('markets.fixture_id', fixtureIds);

        const answeredIds = new Set(
          (answered ?? []).map(
            (row) => (row.markets as unknown as { fixture_id: string }).fixture_id,
          ),
        );
        const unpredicted = fixtureIds.length - answeredIds.size;

        // The rule that makes this worth having: nothing to say, so say nothing.
        if (unpredicted === 0) continue;

        const { data: subscriptions } = await client
          .from('push_subscriptions')
          .select('id, endpoint, keys')
          .eq('user_id', pref.user_id);

        if (!subscriptions || subscriptions.length === 0) {
          result.skippedNoSubscription += 1;
          continue;
        }

        const message = deadlineReminder({
          unpredicted,
          matchweekNumber: round.number,
          minutesToLock: (new Date(next.kickoff_at).getTime() - now) / 60_000,
        });

        const outcomes = await sendPushToAll(
          subscriptions.map(
            (row): PushTarget => ({
              id: row.id,
              endpoint: row.endpoint,
              keys: row.keys as unknown as { p256dh: string; auth: string },
            }),
          ),
          message,
        );

        // A dead endpoint is deleted rather than retried forever. Browsers rotate these
        // routinely, and a table full of gone subscriptions slows every future send.
        const expired = outcomes.filter((o) => o.status === 'expired');
        if (expired.length > 0) {
          await client
            .from('push_subscriptions')
            .delete()
            .in('id', expired.map((o) => o.targetId));
          result.expiredRemoved += expired.length;
        }

        result.failed += outcomes.filter((o) => o.status === 'failed').length;

        if (outcomes.some((o) => o.status === 'sent')) {
          // Logged only on a real delivery, so a total failure is retried next tick rather
          // than being recorded as done.
          const { error } = await client.from('notification_log').insert({
            user_id: pref.user_id,
            type: DEADLINE_REMINDER,
            channel: 'push',
            dedupe_key: dedupeKey,
            payload: { unpredicted, round_id: round.id, lead_minutes: leadMinutes },
          });

          // A unique violation means another tick got there first. Not an error.
          if (error && error.code !== '23505') throw error;
          result.sent += 1;
        }
      }

      return { result, recordsWritten: result.sent };
    }),
  );
}
