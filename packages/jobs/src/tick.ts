import type { Database } from '@matchday/domain';
import type { ProviderAdapter, ScheduleProvider, SeasonRef } from '@matchday/provider';
import type { SupabaseClient } from '@supabase/supabase-js';

import { settleFixtureMarkets } from './settlement';
import { settleLeaguePrizes } from './prizes';
import { sendDeadlineReminders } from './reminders';
import { snapshotRanks } from './snapshots';
import { syncFinal } from './sync-final';
import { syncFixtures } from './sync-fixtures';
import { syncLive } from './sync-live';
import { syncReference } from './sync-reference';
import { type SyncAction, planWindow } from './windows';

type Db = SupabaseClient<Database>;

/**
 * Tick controller — what actually happens each minute.
 *
 * Ordered by consequence, not by cost. The lock sweep runs first and unconditionally:
 * reveal policies key off market status, so a late sweep leaves predictions hidden past
 * kickoff, or worse leaves a market reading "open" to a UI that then offers an input the
 * database will reject.
 *
 * Every step is independently safe to skip. A tick that dies halfway leaves the next one
 * to finish the job, which is why nothing here depends on a previous step having run.
 *
 * Ingestion is optional. Without an adapter the tick still locks, settles and snapshots —
 * which is exactly what it did before ingestion existed, and what it does in any
 * environment with no provider key. The database half of the pipeline never depends on the
 * provider half being configured.
 */

export interface TickResult {
  marketsLocked: number;
  selectionFallbacks: number;
  fixturesSettled: number;
  snapshotsWritten: number;
  /** Prize ledger rows written or revised on this tick. */
  prizesSettled: number;
  /** Deadline reminders delivered on this tick. */
  remindersSent: number;
  /** Empty when no adapter is configured. */
  ingestion: IngestionSummary | null;
  errors: string[];
}

export interface IngestionSummary {
  actions: SyncAction[];
  reason: string;
  estimatedRequests: number;
  liveUpdated: number;
  eventsWritten: number;
  finalised: number;
  corrected: number;
  rescheduled: number;
  standingsRows: number;
  fixturesLinked: number;
  skippedForQuota: boolean;
}

export interface TickOptions {
  /** Live scores and events. Absent when no provider key is configured. */
  adapter?: ProviderAdapter | null;
  /**
   * The fixture schedule. A separate source on purpose: it comes from the Premier League's
   * own JSON, needs no key, and is the only thing that can answer season-scoped questions
   * on a free API-Football plan.
   */
  scheduleAdapter?: ScheduleProvider | null;
  seasonRef?: SeasonRef;
  /** Stand down when fewer than this many provider requests remain today. */
  quotaFloor?: number;
  now?: number;
}

export async function runTick(client: Db, options: TickOptions = {}): Promise<TickResult> {
  const errors: string[] = [];
  const now = options.now ?? Date.now();

  const marketsLocked = await step(errors, 'lock_markets_sweep', async () => {
    const { data, error } = await client.rpc('lock_markets_sweep');
    if (error) throw error;
    return data ?? 0;
  });

  const selectionFallbacks = await step(errors, 'apply_selection_fallbacks', async () => {
    const { data, error } = await client.rpc('apply_selection_fallbacks');
    if (error) throw error;
    return data ?? 0;
  });

  // --- ingestion ------------------------------------------------------------
  //
  // Runs before settlement so that a result arriving this minute is settled on this tick
  // rather than the next. On a Saturday that is the difference between a leaderboard that
  // updates at full time and one that updates a minute later, every time.
  let ingestion: IngestionSummary | null = null;

  if ((options.adapter || options.scheduleAdapter) && options.seasonRef) {
    ingestion = await ingest(client, options.seasonRef, now, options, errors);
  }

  // Finished fixtures whose markets have not settled. Settlement takes a per-fixture
  // advisory lock, so a slow run simply means the next tick picks up where this left off
  // rather than two runs racing.
  const fixturesSettled = await step(errors, 'settle_finished', async () => {
    const { data: pending } = await client
      .from('fixtures')
      .select('id, markets!inner ( status )')
      .in('status', ['finished', 'postponed', 'abandoned', 'cancelled'])
      .neq('markets.status', 'settled')
      .limit(20);

    const ids = [...new Set((pending ?? []).map((row) => row.id))];
    let settled = 0;

    for (const fixtureId of ids) {
      const result = await settleFixtureMarkets(client, fixtureId, 'auto_result');
      // null means another run holds the lock — normal, not an error.
      if (result != null) settled += 1;
    }

    return settled;
  });

  // Snapshots only after something settled: a snapshot per minute of an unchanged board
  // is noise that makes the movement arrows meaningless. A correction counts too — it
  // moves ranks, and the arrows should show that.
  const settlementHappened = fixturesSettled > 0 || (ingestion?.corrected ?? 0) > 0;
  const snapshotsWritten = settlementHappened
    ? await step(errors, 'snapshot_ranks', () => snapshotRanks(client))
    : 0;

  // Prizes follow the board. Settled only when something actually changed, and only for
  // leagues that have a scheme — settleLeaguePrizes no-ops for the points-only default,
  // which is most leagues. A correction re-runs this too, which is the point: a revised
  // result moves money, and the ledger records the revision rather than editing silently.
  const prizesSettled = settlementHappened
    ? await step(errors, 'settle_prizes', async () => {
        const { data: leagueSeasons } = await client
          .from('league_seasons')
          .select('id')
          .not('prize_scheme_id', 'is', null);

        let settled = 0;
        for (const leagueSeason of leagueSeasons ?? []) {
          const result = await settleLeaguePrizes(client, leagueSeason.id);
          if (result && result.skipped == null) settled += result.written + result.revised;
        }
        return settled;
      })
    : 0;

  // Reminders run every tick regardless of settlement: they are about fixtures that have
  // NOT happened yet, and the window they watch is one minute wide.
  const remindersSent = await step(errors, 'send_deadline_reminders', async () => {
    const result = await sendDeadlineReminders(client, { now });
    return result?.sent ?? 0;
  });

  return {
    marketsLocked,
    selectionFallbacks,
    remindersSent,
    fixturesSettled,
    snapshotsWritten,
    prizesSettled,
    ingestion,
    errors,
  };
}

async function ingest(
  client: Db,
  seasonRef: SeasonRef,
  now: number,
  options: TickOptions,
  errors: string[],
): Promise<IngestionSummary> {
  const adapter = options.adapter ?? null;
  const scheduleAdapter = options.scheduleAdapter ?? null;
  const summary: IngestionSummary = {
    actions: [],
    reason: 'not evaluated',
    estimatedRequests: 0,
    liveUpdated: 0,
    eventsWritten: 0,
    finalised: 0,
    corrected: 0,
    rescheduled: 0,
    standingsRows: 0,
    fixturesLinked: 0,
    skippedForQuota: false,
  };

  // Which season, and what is happening in it. One query, no provider calls — this is what
  // makes an idle day free.
  const { data: season } = await client
    .from('seasons')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();

  if (!season) {
    summary.reason = 'no current season';
    return summary;
  }

  const horizonStart = new Date(now - 6 * 60 * 60 * 1000).toISOString();
  const horizonEnd = new Date(now + 6 * 60 * 60 * 1000).toISOString();

  const { data: nearby } = await client
    .from('fixtures')
    .select('kickoff_at, status, result_hash, rounds!fixtures_round_id_fkey!inner ( stages!inner ( season_id ) )')
    .eq('rounds.stages.season_id', season.id)
    .gte('kickoff_at', horizonStart)
    .lte('kickoff_at', horizonEnd);

  const rows = nearby ?? [];
  const plan = planWindow({
    now,
    kickoffs: rows.map((r) => new Date(r.kickoff_at).getTime()),
    hasInPlay: rows.some((r) => ['lineups', 'live', 'ht'].includes(r.status)),
    hasUnfinalised: rows.some(
      (r) => ['lineups', 'live', 'ht', 'finished'].includes(r.status) && r.result_hash == null,
    ),
    hasRecentlySettled: rows.some((r) => ['settled', 'finished'].includes(r.status)),
  });

  summary.actions = plan.actions;
  summary.reason = plan.reason;
  summary.estimatedRequests = plan.estimatedRequests;

  if (plan.actions.length === 0) return summary;

  // Quota gate. The breaker in quota.ts protects against a provider that is failing; this
  // protects against one that is working perfectly and being asked too much. On the Free
  // plan's 100/day a single matchday would otherwise exhaust the budget mid-afternoon and
  // leave the evening kickoff with no data at all — better to degrade deliberately.
  const floor = options.quotaFloor ?? 0;
  if (floor > 0 && adapter) {
    const { data: used } = await client
      .from('provider_quota_ledger')
      .select('calls')
      .eq('provider', adapter.name)
      .eq('day', new Date(now).toISOString().slice(0, 10))
      .maybeSingle();

    const spent = used?.calls ?? 0;
    if (spent + plan.estimatedRequests > floor) {
      summary.skippedForQuota = true;
      summary.reason = `${plan.reason} — held back, ${spent} requests used today`;
      return summary;
    }
  }

  const seasonId = season.id;

  for (const action of plan.actions) {
    // Live, finalisation and reference all need the results provider; the schedule does
    // not. Without a key the tick still keeps fixtures and kickoffs current, which is what
    // the lock sweep depends on.
    if (action === 'live' && adapter) {
      await step(errors, 'sync_live', async () => {
        const result = await syncLive(client, adapter, { seasonId, seasonRef });
        summary.liveUpdated += result?.updated ?? 0;
        summary.eventsWritten += result?.eventsWritten ?? 0;
        summary.fixturesLinked += result?.linked ?? 0;
        return 0;
      });
    }

    if (action === 'final' && adapter) {
      await step(errors, 'sync_final', async () => {
        const result = await syncFinal(client, adapter, { mode: 'finalise' });
        summary.finalised += result?.finalised ?? 0;
        return 0;
      });
    }

    if (action === 'corrections' && adapter) {
      await step(errors, 'sync_corrections', async () => {
        const result = await syncFinal(client, adapter, { mode: 'corrections' });
        summary.corrected += result?.corrected ?? 0;
        return 0;
      });
    }

    if (action === 'fixtures' && scheduleAdapter) {
      await step(errors, 'sync_fixtures', async () => {
        // The schedule provider, not the results one: API-Football's free plan refuses
        // season-scoped calls, and this is the call that keeps prediction locks aligned
        // with kickoffs.
        const result = await syncFixtures(client, scheduleAdapter, {
          seasonId,
          seasonRef,
          horizonDays: 30,
        });
        summary.rescheduled += result?.rescheduled ?? 0;
        return 0;
      });
    }

    if (action === 'reference' && adapter) {
      await step(errors, 'sync_reference', async () => {
        const result = await syncReference(client, adapter, {
          seasonId,
          seasonRef,
          skipIfUnplayed: true,
        });
        summary.standingsRows += result?.standingsRows ?? 0;
        return 0;
      });
    }
  }

  return summary;
}

/**
 * Runs one step, recording rather than propagating its failure.
 *
 * A failing settlement must not stop the lock sweep from running on the next tick — the
 * sweep is the control that keeps predictions honest, and it is the last thing that
 * should be taken down by an unrelated bug.
 */
async function step(
  errors: string[],
  name: string,
  work: () => Promise<number>,
): Promise<number> {
  try {
    return await work();
  } catch (error) {
    errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
}
