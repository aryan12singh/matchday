import 'server-only';

import { type FixturePresentation, fixturePresentation } from '@matchday/domain';

import { createClient } from './supabase/server';

/**
 * Matchweek reads for the predict screen.
 *
 * Everything the UI needs to decide a fixture's state comes from the database: the
 * fixture status and whether its markets are still open. The screen never compares a
 * kickoff time to the browser clock to decide whether something is editable, because the
 * browser clock is not the authority and a skewed one would offer an input the database
 * will reject (invariant 3).
 */

export interface FixtureMarketPrediction {
  score: { home: number; away: number } | null;
  goalDiff: number | null;
  totalGoals: number | null;
  btts: boolean | null;
  firstScoringTeam: { teamId: string | null; none: boolean };
  firstGoalscorer: { playerId: string | null; none: boolean };
}

export interface PredictFixture {
  id: string;
  kickoffAt: string;
  status: string;
  presentation: FixturePresentation;
  home: { id: string; name: string; code: string | null };
  away: { id: string; name: string; code: string | null };
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  /** True while every market on this fixture is still writable. */
  editable: boolean;
  prediction: FixtureMarketPrediction;
  /** Leagues of the viewer's that count this fixture, for the "counts in ..." badges. */
  countsIn: string[];
  /** Complete when the scoreline is filled in — the hedges are optional by design. */
  complete: boolean;
}

export interface Matchweek {
  roundId: string;
  number: number;
  name: string;
  seasonId: string;
  fixtures: PredictFixture[];
  /** The next market to lock, for the "next to lock" rail. */
  nextLockAt: string | null;
}

const emptyPrediction = (): FixtureMarketPrediction => ({
  score: null,
  goalDiff: null,
  totalGoals: null,
  btts: null,
  firstScoringTeam: { teamId: null, none: false },
  firstGoalscorer: { playerId: null, none: false },
});

/** The round to show by default: the next one with an unlocked fixture, else the latest. */
export async function getCurrentRoundId(): Promise<string | null> {
  const supabase = await createClient();

  const { data: upcoming } = await supabase
    .from('fixtures')
    .select('round_id, kickoff_at')
    .gt('kickoff_at', new Date().toISOString())
    .order('kickoff_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (upcoming) return upcoming.round_id;

  // Season over, or nothing scheduled: fall back to the most recent round played.
  const { data: latest } = await supabase
    .from('fixtures')
    .select('round_id, kickoff_at')
    .order('kickoff_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return latest?.round_id ?? null;
}

export async function getMatchweek(
  roundId: string,
  userId: string,
): Promise<Matchweek | null> {
  const supabase = await createClient();

  const { data: round } = await supabase
    .from('rounds')
    .select('id, number, name, stages ( season_id )')
    .eq('id', roundId)
    .maybeSingle();

  if (!round) return null;

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select(
      `id, kickoff_at, status, home_score, away_score, minute,
       home:teams!fixtures_home_team_id_fkey ( id, name, code ),
       away:teams!fixtures_away_team_id_fkey ( id, name, code ),
       markets ( id, status, locks_at, market_types ( code ) )`,
    )
    .eq('round_id', roundId)
    .order('kickoff_at', { ascending: true });

  const fixtureIds = (fixtures ?? []).map((f) => f.id);

  // Own predictions only. RLS would hide other people's anyway, but selecting by user
  // keeps the payload small on a 10-fixture matchweek.
  const { data: predictions } = await supabase
    .from('predictions')
    .select('value, markets!inner ( fixture_id, market_types ( code ) )')
    .eq('user_id', userId)
    .in('markets.fixture_id', fixtureIds.length > 0 ? fixtureIds : ['00000000-0000-0000-0000-000000000000']);

  const byFixture = new Map<string, FixtureMarketPrediction>();
  for (const row of predictions ?? []) {
    const fixtureId = row.markets?.fixture_id;
    const code = row.markets?.market_types?.code;
    if (!fixtureId || !code) continue;

    const current = byFixture.get(fixtureId) ?? emptyPrediction();
    const value = row.value as Record<string, unknown>;

    switch (code) {
      case 'correct_score':
        current.score = { home: Number(value.home), away: Number(value.away) };
        break;
      case 'goal_diff':
        current.goalDiff = value.value == null ? null : Number(value.value);
        break;
      case 'total_goals':
        current.totalGoals = value.value == null ? null : Number(value.value);
        break;
      case 'btts':
        current.btts = value.value == null ? null : Boolean(value.value);
        break;
      case 'first_scoring_team':
        current.firstScoringTeam = {
          teamId: (value.teamId as string) ?? null,
          none: Boolean(value.none),
        };
        break;
      case 'first_goalscorer':
        current.firstGoalscorer = {
          playerId: (value.playerId as string) ?? null,
          none: Boolean(value.none),
        };
        break;
    }
    byFixture.set(fixtureId, current);
  }

  // Which of the viewer's leagues count each fixture (invariant 7).
  const countsIn = await getFixtureLeagueBadges(roundId, fixtureIds);

  const mapped: PredictFixture[] = (fixtures ?? []).map((fixture) => {
    const markets = fixture.markets ?? [];
    const allOpen = markets.length > 0 && markets.every((m) => m.status === 'open');
    const prediction = byFixture.get(fixture.id) ?? emptyPrediction();

    return {
      id: fixture.id,
      kickoffAt: fixture.kickoff_at,
      status: fixture.status,
      presentation: fixturePresentation(
        fixture.status as never,
        !allOpen,
      ),
      home: { id: fixture.home.id, name: fixture.home.name, code: fixture.home.code },
      away: { id: fixture.away.id, name: fixture.away.name, code: fixture.away.code },
      homeScore: fixture.home_score,
      awayScore: fixture.away_score,
      minute: fixture.minute,
      editable: allOpen,
      prediction,
      countsIn: countsIn.get(fixture.id) ?? [],
      complete: prediction.score != null,
    };
  });

  const nextLock = mapped
    .filter((f) => f.editable)
    .map((f) => f.kickoffAt)
    .sort()[0];

  return {
    roundId: round.id,
    number: round.number,
    name: round.name,
    seasonId: round.stages?.season_id ?? '',
    fixtures: mapped,
    nextLockAt: nextLock ?? null,
  };
}

/**
 * League names to badge each fixture with. A league using `all` counts everything; a
 * league using selection counts what league_round_fixtures() returns, which falls back
 * to everything while nothing is finalized — so a fixture is never silently uncounted.
 */
async function getFixtureLeagueBadges(
  roundId: string,
  fixtureIds: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (fixtureIds.length === 0) return result;

  const supabase = await createClient();
  const { data: leagueSeasons } = await supabase
    .from('league_seasons')
    .select('id, selection_mode, leagues ( name )');

  for (const ls of leagueSeasons ?? []) {
    const name = ls.leagues?.name;
    if (!name) continue;

    if (ls.selection_mode === 'all') {
      for (const id of fixtureIds) {
        result.set(id, [...(result.get(id) ?? []), name]);
      }
      continue;
    }

    const { data: counted } = await supabase.rpc('league_round_fixtures', {
      p_league_season_id: ls.id,
      p_round_id: roundId,
    });

    for (const row of counted ?? []) {
      result.set(row.fixture_id, [...(result.get(row.fixture_id) ?? []), name]);
    }
  }

  return result;
}

/** Squad list for the first-scorer picker. */
export async function getSquads(fixtureId: string) {
  const supabase = await createClient();

  const { data: fixture } = await supabase
    .from('fixtures')
    .select('home_team_id, away_team_id, rounds ( stages ( season_id ) )')
    .eq('id', fixtureId)
    .maybeSingle();

  if (!fixture) return [];

  const seasonId = fixture.rounds?.stages?.season_id;
  if (!seasonId) return [];

  const { data } = await supabase
    .from('squad_memberships')
    .select('shirt_number, team_id, players ( id, full_name, known_as, position )')
    .eq('season_id', seasonId)
    .in('team_id', [fixture.home_team_id, fixture.away_team_id]);

  return (data ?? []).map((row) => ({
    playerId: row.players?.id ?? '',
    name: row.players?.known_as ?? row.players?.full_name ?? 'Unknown',
    position: row.players?.position ?? null,
    shirtNumber: row.shirt_number,
    teamId: row.team_id,
  }));
}
