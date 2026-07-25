import 'server-only';

import { createServiceClient } from './supabase/service';

/**
 * /ops reads.
 *
 * These use the service client because the tables they read have no client policies at
 * all (§10.2) — sync_runs, raw_payloads and the quota ledger are deliberately unreachable
 * from any browser session. The layout has already established the caller is a platform
 * admin; this module never checks again, so it must never be imported anywhere else.
 */

export interface OpsHealth {
  runs: Array<{
    id: string;
    kind: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    recordsWritten: number;
    error: string | null;
  }>;
  stuckRuns: number;
  quota: Array<{ provider: string; day: string; calls: number; limit: number | null }>;
  counts: {
    fixtures: number;
    markets: number;
    openMarkets: number;
    unsettledFinished: number;
    predictions: number;
    users: number;
    leagues: number;
  };
  scoreRuns: Array<{
    id: string;
    trigger: string;
    status: string;
    startedAt: string;
    changed: number;
  }>;
}

export async function getOpsHealth(): Promise<OpsHealth> {
  const db = createServiceClient();

  const [runs, quota, scoreRuns] = await Promise.all([
    db
      .from('sync_runs')
      .select('id, kind, status, started_at, finished_at, records_written, error_summary')
      .order('started_at', { ascending: false })
      .limit(20),
    db
      .from('provider_quota_ledger')
      .select('provider, day, calls, plan_limit')
      .order('day', { ascending: false })
      .limit(7),
    db
      .from('score_runs')
      .select('id, trigger, status, started_at, stats')
      .order('started_at', { ascending: false })
      .limit(10),
  ]);

  const count = async (table: string, filter?: (q: never) => never) => {
    let query = db.from(table as never).select('*', { count: 'exact', head: true });
    if (filter) query = filter(query as never);
    const { count: n } = await query;
    return n ?? 0;
  };

  const [fixtures, markets, predictions, leagues] = await Promise.all([
    count('fixtures'),
    count('markets'),
    count('predictions'),
    count('leagues'),
  ]);

  const { count: openMarkets } = await db
    .from('markets')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open');

  // Finished fixtures whose markets have not settled: the single most useful number on
  // this page, because it is the one that means someone is owed points.
  const { data: unsettled } = await db
    .from('fixtures')
    .select('id, markets!inner ( status )')
    .eq('status', 'finished')
    .neq('markets.status', 'settled');

  const { data: users } = await db.from('profiles').select('id');

  return {
    runs: (runs.data ?? []).map((run) => ({
      id: run.id,
      kind: run.kind,
      status: run.status,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      recordsWritten: run.records_written,
      error: run.error_summary,
    })),
    // A run still 'running' well after it started means something died mid-flight.
    stuckRuns: (runs.data ?? []).filter(
      (run) =>
        run.status === 'running' &&
        Date.now() - new Date(run.started_at).getTime() > 10 * 60 * 1000,
    ).length,
    quota: (quota.data ?? []).map((row) => ({
      provider: row.provider,
      day: row.day,
      calls: row.calls,
      limit: row.plan_limit,
    })),
    counts: {
      fixtures,
      markets,
      openMarkets: openMarkets ?? 0,
      unsettledFinished: new Set((unsettled ?? []).map((f) => f.id)).size,
      predictions,
      users: (users ?? []).length,
      leagues,
    },
    scoreRuns: (scoreRuns.data ?? []).map((run) => ({
      id: run.id,
      trigger: run.trigger,
      status: run.status,
      startedAt: run.started_at,
      changed: Number((run.stats as Record<string, unknown> | null)?.components_changed ?? 0),
    })),
  };
}
