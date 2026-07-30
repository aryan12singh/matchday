import type { Database } from '@matchday/domain';
import type { ProviderAdapter, ProviderEvent, ProviderFixture } from '@matchday/provider';
import type { SupabaseClient } from '@supabase/supabase-js';

import { archiveRawPayload } from './bootstrap';
import { withAdvisoryLock } from './locks';
import { settleFixtureMarkets } from './settlement';
import { writeEvents } from './sync-live';
import { runJob } from './sync-runs';

type Db = SupabaseClient<Database>;

/**
 * Finalisation and the correction re-check.
 *
 * Two jobs that share a fetch, because they are the same fetch:
 *
 *   1. **Finalise.** A fixture stops appearing in the live list the moment it ends, so
 *      "the live feed no longer mentions it" is how a match finishes, not an event we are
 *      told about. Without this, fixtures would sit at 'live' with a 90th-minute score
 *      forever and settlement — which triggers on 'finished' — would never fire.
 *
 *   2. **Corrections.** Providers revise results after the whistle: a goal reassigned
 *      after a deflection, an own goal recategorised, a disciplinary change days later.
 *      Invariant 5 requires settlement to be re-runnable, and this is what re-runs it. A
 *      first-goalscorer market is the sharpest case — reassigning the opening goal moves
 *      points between users, so a correction nobody notices is a leaderboard that is
 *      quietly wrong for the rest of the season.
 *
 * `result_hash` is how a correction is detected without diffing every market: hash the
 * score and the goal events, compare, and only do real work when the bytes disagree.
 */

export interface SyncFinalOptions {
  /**
   * `finalise` (default) only looks at fixtures with no confirmed result yet — the cheap,
   * every-minute case. `corrections` re-checks already-settled fixtures, which costs two
   * requests each and is worth doing twice an hour, not every tick.
   */
  mode?: 'finalise' | 'corrections';
  /** How long after kickoff to keep re-checking a settled fixture. Default 72h. */
  correctionWindowHours?: number;
  /** Cap the fixtures handled in one run so a backlog cannot blow the quota. */
  limit?: number;
}

export interface SyncFinalResult {
  finalised: number;
  corrected: number;
  checked: number;
  settlementFailures: number;
}

export async function syncFinal(
  client: Db,
  adapter: ProviderAdapter,
  options: SyncFinalOptions = {},
): Promise<SyncFinalResult | null> {
  const mode = options.mode ?? 'finalise';
  const correctionWindowHours = options.correctionWindowHours ?? 72;
  const limit = options.limit ?? (mode === 'corrections' ? 5 : 20);

  return withAdvisoryLock(client, 'sync:final', () =>
    runJob(client, 'sync_fixture_final', 'tick', {}, async () => {
      const result: SyncFinalResult = {
        finalised: 0,
        corrected: 0,
        checked: 0,
        settlementFailures: 0,
      };

      const now = Date.now();
      const windowStart = new Date(now - correctionWindowHours * 60 * 60 * 1000).toISOString();

      // Candidates: in-play fixtures whose kickoff is long enough ago that they should have
      // ended, plus settled ones still inside the correction window.
      //
      // The 150-minute floor is deliberately generous. A match delayed by a floodlight
      // failure is still the same fixture, and finalising it early on a stale read would
      // settle a scoreline that is not final yet.
      const staleLiveCutoff = new Date(now - 150 * 60 * 1000).toISOString();

      let query = client
        .from('fixtures')
        .select('id, status, kickoff_at, home_score, away_score, result_hash')
        .gte('kickoff_at', windowStart)
        .lte('kickoff_at', new Date(now).toISOString());

      if (mode === 'corrections') {
        // Only fixtures whose result is already confirmed. Re-reading these is the
        // expensive half, so it is gated to a couple of runs an hour by the windowing.
        query = query.in('status', ['settled', 'finished']).not('result_hash', 'is', null);
      } else {
        // Everything still awaiting a confirmed result. Once result_hash is set, a fixture
        // leaves this set permanently, which is what keeps the every-minute case cheap.
        query = query
          .in('status', ['lineups', 'live', 'ht', 'finished'])
          .is('result_hash', null);
      }

      const { data: candidates, error } = await query
        .order('kickoff_at', { ascending: true })
        .limit(limit);
      if (error) throw error;

      for (const fixture of candidates ?? []) {
        const inPlay = ['lineups', 'live', 'ht'].includes(fixture.status);

        // An in-play fixture that has not yet passed the stale cutoff is simply still being
        // played — the live sync owns it, and asking again here would double its cost.
        if (inPlay && fixture.kickoff_at > staleLiveCutoff) continue;

        const providerId = await providerIdFor(client, adapter.name, fixture.id);
        if (!providerId) continue;

        result.checked += 1;

        const fixtureResponse = await adapter.getFixture(providerId);
        await archiveRawPayload(client, adapter.name, fixtureResponse);
        const incoming = fixtureResponse.data;

        // Still genuinely in progress despite the clock — leave it to the live sync.
        if (['scheduled', 'lineups', 'live', 'ht'].includes(incoming.status)) continue;

        const eventsResponse = await adapter.listEvents(providerId);
        await archiveRawPayload(client, adapter.name, eventsResponse);

        const hash = resultHash(incoming, eventsResponse.data);
        if (fixture.result_hash === hash) continue;

        await writeEvents(client, adapter.name, fixture.id, eventsResponse.data);

        const { error: updateError } = await client
          .from('fixtures')
          .update({
            status: incoming.status === 'awarded' ? 'awarded' : incoming.status,
            minute: null,
            home_score: incoming.homeScore,
            away_score: incoming.awayScore,
            ht_home: incoming.htHome,
            ht_away: incoming.htAway,
            result_confirmed_at: new Date().toISOString(),
            result_hash: hash,
          })
          .eq('id', fixture.id);
        if (updateError) throw updateError;

        const wasSettled = fixture.status === 'settled';

        // A fixture reaching 'finished' is picked up by the tick's settle step on this same
        // run, so finalising deliberately does not settle here — one settlement path, not
        // two racing. A correction is different: the markets are already settled, so the
        // tick will never look at it again and this is the only thing that can re-run it.
        if (wasSettled) {
          const settlement = await settleFixtureMarkets(client, fixture.id, 'correction');
          if (settlement == null) result.settlementFailures += 1;
          result.corrected += 1;
        } else {
          result.finalised += 1;
        }
      }

      return {
        result,
        recordsRead: result.checked,
        recordsWritten: result.finalised + result.corrected,
      };
    }),
  );
}

/**
 * A stable fingerprint of everything settlement depends on.
 *
 * Scoreline plus the goal events in order, because those are exactly the inputs to the
 * settlers — a yellow card being added later is not a correction worth re-settling for,
 * and including it would re-run settlement across the league every time a disciplinary
 * record was tidied up.
 */
export function resultHash(
  fixture: Pick<ProviderFixture, 'status' | 'homeScore' | 'awayScore' | 'htHome' | 'htAway'>,
  events: readonly ProviderEvent[],
): string {
  const goals = events
    .filter((e) => e.type === 'goal' || e.type === 'own_goal' || e.type === 'penalty_goal')
    .map((e) =>
      [e.minute ?? 'x', e.addedMinute ?? 0, e.type, e.teamProviderId ?? '-', e.playerProviderId ?? '-'].join(
        ':',
      ),
    )
    .sort();

  const canonical = [
    fixture.status,
    fixture.homeScore ?? '-',
    fixture.awayScore ?? '-',
    fixture.htHome ?? '-',
    fixture.htAway ?? '-',
    ...goals,
  ].join('|');

  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Reverse lookup through provider_entity_map: internal fixture id → provider id. */
async function providerIdFor(
  client: Db,
  provider: string,
  fixtureId: string,
): Promise<string | null> {
  const { data } = await client
    .from('provider_entity_map')
    .select('provider_id')
    .eq('provider', provider)
    .eq('entity_type', 'fixture')
    .eq('internal_id', fixtureId)
    .maybeSingle();

  return data?.provider_id ?? null;
}
