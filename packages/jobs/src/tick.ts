import type { Database } from '@matchday/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

import { settleFixtureMarkets } from './settlement';
import { snapshotRanks } from './snapshots';

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
 */

export interface TickResult {
  marketsLocked: number;
  selectionFallbacks: number;
  fixturesSettled: number;
  snapshotsWritten: number;
  errors: string[];
}

export async function runTick(client: Db): Promise<TickResult> {
  const errors: string[] = [];

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
  // is noise that makes the movement arrows meaningless.
  const snapshotsWritten =
    fixturesSettled > 0
      ? await step(errors, 'snapshot_ranks', () => snapshotRanks(client))
      : 0;

  return { marketsLocked, selectionFallbacks, fixturesSettled, snapshotsWritten, errors };
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
