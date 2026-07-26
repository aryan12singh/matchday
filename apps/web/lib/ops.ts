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


export interface FixtureInspection {
  id: string;
  status: string;
  kickoffAt: string;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  resultHash: string | null;
  manualOverride: boolean;
  events: Array<{ minute: number | null; type: string; providerEventKey: string | null }>;
  componentCount: number;
  hitCount: number;
  userCount: number;
  payloads: Array<{ id: string; endpoint: string; fetchedAt: string; httpStatus: number | null }>;
}

/**
 * Raw payload inspector data (§4.2 screen 18).
 *
 * This is why invariant 1 archives every provider response before interpreting it: when a
 * normalizer is wrong, this shows what the provider actually said, rather than spending
 * prepaid quota asking again.
 */
export async function inspectFixture(fixtureId: string): Promise<FixtureInspection | null> {
  const db = createServiceClient();

  const [{ data: fixture }, { data: components }, { data: payloads }] = await Promise.all([
    db
      .from('fixtures')
      .select(
        `id, status, kickoff_at, home_score, away_score, result_hash, manual_override,
         home:teams!fixtures_home_team_id_fkey ( name ),
         away:teams!fixtures_away_team_id_fkey ( name ),
         fixture_events ( minute, type, provider_event_key )`,
      )
      .eq('id', fixtureId)
      .maybeSingle(),
    db
      .from('score_components')
      .select('category, hit, user_id, markets!inner ( fixture_id )')
      .eq('markets.fixture_id', fixtureId),
    db
      .from('raw_payloads')
      .select('id, endpoint, fetched_at, http_status')
      .order('fetched_at', { ascending: false })
      .limit(10),
  ]);

  if (!fixture) return null;

  return {
    id: fixture.id,
    status: fixture.status,
    kickoffAt: fixture.kickoff_at,
    homeName: fixture.home?.name ?? '?',
    awayName: fixture.away?.name ?? '?',
    homeScore: fixture.home_score,
    awayScore: fixture.away_score,
    resultHash: fixture.result_hash,
    manualOverride: fixture.manual_override,
    events: (fixture.fixture_events ?? []).map((event) => ({
      minute: event.minute,
      type: event.type,
      providerEventKey: event.provider_event_key,
    })),
    componentCount: (components ?? []).length,
    hitCount: (components ?? []).filter((c) => c.hit).length,
    userCount: new Set((components ?? []).map((c) => c.user_id)).size,
    payloads: (payloads ?? []).map((payload) => ({
      id: payload.id,
      endpoint: payload.endpoint,
      fetchedAt: payload.fetched_at,
      httpStatus: payload.http_status,
    })),
  };
}
