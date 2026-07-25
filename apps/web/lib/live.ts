import 'server-only';

import { DEFAULT_WEIGHTS, type FixtureOutcome, type FixturePrediction } from '@matchday/domain';
import { settleFixture, valueComponents } from '@matchday/scoring';

import { createClient } from './supabase/server';

/**
 * Live match reads and provisional scoring — design/screens/Live Match v2.dc.html.
 *
 * Provisional points run the *same* settlers over the current score as if it were final
 * (06-scoring-leaderboards-prizes.md §6.3). They are never written to score_components —
 * only finished fixtures settle — and every surface that shows them must say so.
 *
 * The category tracker is the point of this screen: not "you have 6 points" but "the
 * exact score is still alive and one goal kills it". That needs each category classified
 * as alive, confirmed or dead, with the condition that would change it.
 */

export type CategoryState = 'confirmed' | 'alive' | 'dead';

export interface CategoryStatus {
  category: string;
  label: string;
  state: CategoryState;
  points: number;
  /** Plain-English condition, e.g. "any goal breaks it". */
  detail: string;
}

export interface LiveMatch {
  fixtureId: string;
  status: string;
  minute: number | null;
  home: { id: string; name: string; code: string | null };
  away: { id: string; name: string; code: string | null };
  homeScore: number;
  awayScore: number;
  venue: string | null;
  kickoffAt: string;
  /** The viewer's prediction, if they made one. */
  prediction: FixturePrediction | null;
  provisionalPoints: number;
  categories: CategoryStatus[];
  events: Array<{
    minute: number | null;
    type: string;
    teamId: string | null;
    playerName: string | null;
  }>;
  /** League mates' picks, only where the reveal policy permits. */
  leaguePicks: Array<{ username: string; home: number; away: number; points: number; isYou: boolean }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  outcome: 'Outcome',
  exact: 'Exact score',
  goal_diff: 'Goal difference',
  total_goals: 'Total goals',
  team_goals: "A team's goals",
  btts: 'Both teams to score',
  first_team: 'First-goal team',
  first_scorer: 'First scorer',
};

/**
 * Classifies each category against the live score.
 *
 * `confirmed` is reserved for things a further goal cannot undo — the first scorer, once
 * there has been a goal, and BTTS once both have scored. Everything else that is
 * currently hitting is `alive`, because in football it is never safe.
 */
function classify(
  prediction: FixturePrediction,
  outcome: FixtureOutcome,
  minute: number | null,
): CategoryStatus[] {
  const components = settleFixture(prediction, outcome);
  const goalsSoFar = outcome.homeScore + outcome.awayScore;
  const bothScored = outcome.homeScore > 0 && outcome.awayScore > 0;
  const remaining = minute != null ? Math.max(0, 90 - minute) : null;
  const timeLeft = remaining != null ? `${remaining} min + stoppage` : 'the rest of the match';

  return components.map((component) => {
    const hit = component.hit;
    const weight = DEFAULT_WEIGHTS[component.category] ?? 0;
    const points = hit ? weight : 0;

    let state: CategoryState = hit ? 'alive' : 'dead';
    let detail = '';

    switch (component.category) {
      case 'first_scorer':
      case 'first_team':
        // Once someone has scored, the first goal is a matter of record.
        if (goalsSoFar > 0) {
          state = hit ? 'confirmed' : 'dead';
          detail = hit ? "provider-confirmed · can't be taken away" : 'settled against you';
        } else {
          state = 'alive';
          detail = 'nobody has scored yet';
        }
        break;

      case 'btts':
        if (bothScored) {
          // Both have scored; that cannot un-happen.
          state = hit ? 'confirmed' : 'dead';
          detail = hit ? 'both teams have scored' : 'both teams have scored';
        } else {
          detail = hit ? `needs the score to stay as it is · ${timeLeft}` : 'still possible';
          state = hit ? 'alive' : 'alive';
        }
        break;

      case 'exact':
        detail = hit ? `any goal breaks it · ${timeLeft} to survive` : 'the scoreline has moved on';
        break;

      case 'outcome':
        detail = hit
          ? outcome.homeScore === outcome.awayScore
            ? 'a draw — one goal either way changes it'
            : 'safe unless the margin flips'
          : 'needs the result to turn around';
        break;

      default:
        detail = hit ? `holds while the score stays ${outcome.homeScore}:${outcome.awayScore}` : 'not on current score';
    }

    return {
      category: component.category,
      label: CATEGORY_LABELS[component.category] ?? component.category,
      state,
      points,
      detail,
    };
  });
}

export async function getLiveMatch(fixtureId: string, userId: string): Promise<LiveMatch | null> {
  const supabase = await createClient();

  const { data: fixture } = await supabase
    .from('fixtures')
    .select(
      `id, status, minute, home_score, away_score, venue, kickoff_at,
       home:teams!fixtures_home_team_id_fkey ( id, name, code ),
       away:teams!fixtures_away_team_id_fkey ( id, name, code ),
       markets ( id, market_types ( code ) ),
       fixture_events ( minute, type, team_id,
         players!fixture_events_player_id_fkey ( known_as, full_name ) )`,
    )
    .eq('id', fixtureId)
    .maybeSingle();

  if (!fixture) return null;

  const marketIds = (fixture.markets ?? []).map((m) => m.id);

  // Own prediction, plus any league mate's the reveal policy allows. RLS decides which
  // of the latter come back — there is no filtering here to get wrong.
  const { data: rows } = await supabase
    .from('predictions')
    .select('user_id, value, markets!inner ( market_types ( code ) ), profiles ( username )')
    .in('market_id', marketIds.length > 0 ? marketIds : ['00000000-0000-0000-0000-000000000000']);

  const byUser = new Map<string, { username: string; prediction: FixturePrediction }>();
  for (const row of rows ?? []) {
    const code = row.markets?.market_types?.code;
    if (!code) continue;

    const entry = byUser.get(row.user_id) ?? {
      username: row.profiles?.username ?? 'player',
      prediction: {
        score: { home: 0, away: 0 },
        goalDiff: null,
        totalGoals: null,
        btts: null,
        firstScoringTeam: { teamId: null, none: false },
        firstGoalscorer: { playerId: null, none: false },
      },
    };

    const value = row.value as Record<string, unknown>;
    if (code === 'correct_score') {
      entry.prediction.score = { home: Number(value.home), away: Number(value.away) };
    } else if (code === 'goal_diff') {
      entry.prediction.goalDiff = value.value == null ? null : Number(value.value);
    } else if (code === 'total_goals') {
      entry.prediction.totalGoals = value.value == null ? null : Number(value.value);
    } else if (code === 'btts') {
      entry.prediction.btts = value.value == null ? null : Boolean(value.value);
    } else if (code === 'first_scoring_team') {
      entry.prediction.firstScoringTeam = {
        teamId: (value.teamId as never) ?? null,
        none: Boolean(value.none),
      };
    } else if (code === 'first_goalscorer') {
      entry.prediction.firstGoalscorer = {
        playerId: (value.playerId as never) ?? null,
        none: Boolean(value.none),
      };
    }

    byUser.set(row.user_id, entry);
  }

  const events = (fixture.fixture_events ?? [])
    .map((event) => ({
      minute: event.minute,
      type: event.type,
      teamId: event.team_id,
      playerName: event.players?.known_as ?? event.players?.full_name ?? null,
    }))
    .sort((a, b) => (b.minute ?? 0) - (a.minute ?? 0));

  // The same outcome shape settlement uses, built from the live score.
  const goals = events
    .filter((e) => e.type === 'goal' || e.type === 'own_goal' || e.type === 'penalty_goal')
    .sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
  const firstGoal = goals[0];
  const ownGoal = firstGoal?.type === 'own_goal';

  const outcome: FixtureOutcome = {
    homeScore: fixture.home_score ?? 0,
    awayScore: fixture.away_score ?? 0,
    firstScoringTeamId: (firstGoal
      ? ownGoal
        ? firstGoal.teamId === fixture.home.id
          ? fixture.away.id
          : fixture.home.id
        : firstGoal.teamId
      : null) as never,
    firstGoalscorerId: null as never,
    equivalentScorerIds: [] as never,
    firstGoalWasOwnGoal: ownGoal,
  };

  const mine = byUser.get(userId)?.prediction ?? null;

  return {
    fixtureId: fixture.id,
    status: fixture.status,
    minute: fixture.minute,
    home: { id: fixture.home.id, name: fixture.home.name, code: fixture.home.code },
    away: { id: fixture.away.id, name: fixture.away.name, code: fixture.away.code },
    homeScore: fixture.home_score ?? 0,
    awayScore: fixture.away_score ?? 0,
    venue: fixture.venue,
    kickoffAt: fixture.kickoff_at,
    prediction: mine,
    provisionalPoints: mine
      ? valueComponents(settleFixture(mine, outcome), DEFAULT_WEIGHTS)
      : 0,
    categories: mine ? classify(mine, outcome, fixture.minute) : [],
    events,
    leaguePicks: [...byUser.entries()]
      .map(([id, entry]) => ({
        username: entry.username,
        home: entry.prediction.score.home,
        away: entry.prediction.score.away,
        points: valueComponents(settleFixture(entry.prediction, outcome), DEFAULT_WEIGHTS),
        isYou: id === userId,
      }))
      .sort((a, b) => b.points - a.points),
  };
}

/** Everything in play or about to be, for the live centre. */
export async function getLiveCentre() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('fixtures')
    .select(
      `id, status, minute, home_score, away_score, kickoff_at,
       home:teams!fixtures_home_team_id_fkey ( name, code ),
       away:teams!fixtures_away_team_id_fkey ( name, code )`,
    )
    .in('status', ['lineups', 'live', 'ht', 'finished'])
    .gte('kickoff_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
    .order('kickoff_at', { ascending: true });

  const upcoming = await supabase
    .from('fixtures')
    .select(
      `id, status, minute, home_score, away_score, kickoff_at,
       home:teams!fixtures_home_team_id_fkey ( name, code ),
       away:teams!fixtures_away_team_id_fkey ( name, code )`,
    )
    .eq('status', 'scheduled')
    .gte('kickoff_at', new Date().toISOString())
    .lte('kickoff_at', new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString())
    .order('kickoff_at', { ascending: true })
    .limit(10);

  const map = (rows: typeof data) =>
    (rows ?? []).map((fixture) => ({
      id: fixture.id,
      status: fixture.status,
      minute: fixture.minute,
      homeName: fixture.home?.name ?? '?',
      awayName: fixture.away?.name ?? '?',
      homeCode: fixture.home?.code ?? null,
      awayCode: fixture.away?.code ?? null,
      homeScore: fixture.home_score,
      awayScore: fixture.away_score,
      kickoffAt: fixture.kickoff_at,
    }));

  const all = map(data);

  return {
    live: all.filter((f) => f.status === 'live' || f.status === 'ht' || f.status === 'lineups'),
    finished: all.filter((f) => f.status === 'finished'),
    upcoming: map(upcoming.data),
  };
}
