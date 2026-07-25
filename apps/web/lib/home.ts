import 'server-only';

import { createClient } from './supabase/server';

/**
 * Home hero state — design/screens/Home v2.dc.html.
 *
 * The hero has four phases and the screen picks one. Derived on the server from
 * matchweek state rather than in the component, because "is anything live" is a database
 * question and a component answering it from the browser clock would show a live band for
 * a match that finished ten minutes ago.
 *
 * Priority is deliberate: live beats everything (something is happening right now),
 * then an unsettled recent round, then an open deadline, then quiet.
 */
export type HeroPhase = 'live' | 'settled' | 'pre-deadline' | 'quiet';

export interface HomeState {
  phase: HeroPhase;
  roundId: string | null;
  roundNumber: number | null;
  roundName: string | null;
  /** Pre-deadline: when the first unpredicted fixture locks. */
  nextLockAt: string | null;
  firstLockFixture: string | null;
  predicted: number;
  total: number;
  /** Live: the match to feature. */
  live: {
    fixtureId: string;
    home: string;
    away: string;
    homeCode: string | null;
    awayCode: string | null;
    homeScore: number;
    awayScore: number;
    minute: number | null;
  } | null;
  /** Settled: last round's results for the "last time out" strip. */
  recent: Array<{
    fixtureId: string;
    home: string;
    away: string;
    homeCode: string | null;
    awayCode: string | null;
    homeScore: number | null;
    awayScore: number | null;
    predictedHome: number | null;
    predictedAway: number | null;
    exact: boolean;
  }>;
  /** Quiet: when the next round opens. */
  nextRoundAt: string | null;
}

export async function getHomeState(userId: string): Promise<HomeState> {
  const supabase = await createClient();

  const empty: HomeState = {
    phase: 'quiet',
    roundId: null,
    roundNumber: null,
    roundName: null,
    nextLockAt: null,
    firstLockFixture: null,
    predicted: 0,
    total: 0,
    live: null,
    recent: [],
    nextRoundAt: null,
  };

  // Anything in play right now, across any round.
  const { data: liveFixtures } = await supabase
    .from('fixtures')
    .select(
      `id, home_score, away_score, minute, round_id,
       home:teams!fixtures_home_team_id_fkey ( name, code ),
       away:teams!fixtures_away_team_id_fkey ( name, code )`,
    )
    .in('status', ['live', 'ht'])
    .order('kickoff_at', { ascending: true })
    .limit(1);

  // The round we care about: the one with the next kickoff, else the most recent.
  const { data: nextFixture } = await supabase
    .from('fixtures')
    .select('round_id, kickoff_at')
    .gt('kickoff_at', new Date().toISOString())
    .order('kickoff_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: lastFixture } = await supabase
    .from('fixtures')
    .select('round_id, kickoff_at')
    .lte('kickoff_at', new Date().toISOString())
    .order('kickoff_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const liveOne = liveFixtures?.[0];
  const roundId = liveOne?.round_id ?? nextFixture?.round_id ?? lastFixture?.round_id ?? null;
  if (!roundId) return empty;

  const { data: round } = await supabase
    .from('rounds')
    .select('id, number, name')
    .eq('id', roundId)
    .maybeSingle();

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select(
      `id, kickoff_at, status, home_score, away_score,
       home:teams!fixtures_home_team_id_fkey ( name, code ),
       away:teams!fixtures_away_team_id_fkey ( name, code ),
       markets ( id, status, market_types ( code ) )`,
    )
    .eq('round_id', roundId)
    .order('kickoff_at', { ascending: true });

  const scoreMarketIds = (fixtures ?? [])
    .flatMap((f) => f.markets ?? [])
    .filter((m) => m.market_types?.code === 'correct_score')
    .map((m) => m.id);

  const { data: predictions } = await supabase
    .from('predictions')
    .select('value, markets!inner ( fixture_id )')
    .eq('user_id', userId)
    .in('market_id', scoreMarketIds.length > 0 ? scoreMarketIds : ['00000000-0000-0000-0000-000000000000']);

  const predictedByFixture = new Map<string, { home: number; away: number }>();
  for (const row of predictions ?? []) {
    const fixtureId = row.markets?.fixture_id;
    if (!fixtureId) continue;
    const value = row.value as { home?: number; away?: number };
    if (value.home == null || value.away == null) continue;
    predictedByFixture.set(fixtureId, { home: value.home, away: value.away });
  }

  const all = fixtures ?? [];
  const openFixtures = all.filter((f) => (f.markets ?? []).some((m) => m.status === 'open'));
  const unpredictedOpen = openFixtures.filter((f) => !predictedByFixture.has(f.id));
  const nextToLock = unpredictedOpen[0] ?? openFixtures[0] ?? null;

  const finished = all.filter((f) => f.status === 'finished' || f.status === 'settled');

  const phase: HeroPhase = liveOne
    ? 'live'
    : // A round that has finished but is still the current one: show the results.
      finished.length > 0 && openFixtures.length === 0
      ? 'settled'
      : openFixtures.length > 0
        ? 'pre-deadline'
        : 'quiet';

  return {
    phase,
    roundId,
    roundNumber: round?.number ?? null,
    roundName: round?.name ?? null,
    nextLockAt: nextToLock?.kickoff_at ?? null,
    firstLockFixture: nextToLock
      ? `${nextToLock.home?.name ?? '?'} v ${nextToLock.away?.name ?? '?'}`
      : null,
    predicted: predictedByFixture.size,
    total: all.length,
    live: liveOne
      ? {
          fixtureId: liveOne.id,
          home: liveOne.home?.name ?? '?',
          away: liveOne.away?.name ?? '?',
          homeCode: liveOne.home?.code ?? null,
          awayCode: liveOne.away?.code ?? null,
          homeScore: liveOne.home_score ?? 0,
          awayScore: liveOne.away_score ?? 0,
          minute: liveOne.minute,
        }
      : null,
    recent: finished.slice(0, 3).map((fixture) => {
      const mine = predictedByFixture.get(fixture.id) ?? null;
      return {
        fixtureId: fixture.id,
        home: fixture.home?.name ?? '?',
        away: fixture.away?.name ?? '?',
        homeCode: fixture.home?.code ?? null,
        awayCode: fixture.away?.code ?? null,
        homeScore: fixture.home_score,
        awayScore: fixture.away_score,
        predictedHome: mine?.home ?? null,
        predictedAway: mine?.away ?? null,
        exact:
          mine != null &&
          mine.home === fixture.home_score &&
          mine.away === fixture.away_score,
      };
    }),
    nextRoundAt: nextFixture?.kickoff_at ?? null,
  };
}
