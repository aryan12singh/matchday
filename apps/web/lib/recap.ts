import 'server-only';

import { DEFAULT_WEIGHTS, resolveWeights, ruleSetDefinitionSchema } from '@matchday/domain';
import { aggregateLeaderboard, toComponentRows } from '@matchday/scoring';

import { createClient } from './supabase/server';

/**
 * Matchweek recap — design/screens/Recap.dc.html.
 *
 * The editorial read on a settled round: who won, the call of the week, the shocker, and
 * where everyone moved. Derived rather than stored, because every input already exists
 * and a recap table would be one more thing to keep correct through a correction rerun.
 */

export interface RecapStory {
  kind: 'call' | 'shocker' | 'streak' | 'table';
  title: string;
  body: string;
}

export interface Recap {
  roundId: string;
  roundName: string;
  settledAt: string | null;
  winner: { username: string; points: number; isYou: boolean } | null;
  runnerUp: { username: string; points: number } | null;
  totals: { leaguePoints: number; exactScores: number; members: number };
  stories: RecapStory[];
  standings: Array<{ username: string; points: number; rank: number; isYou: boolean }>;
  hasPrizes: boolean;
}

export async function getRecap(
  leagueSeasonId: string,
  leagueId: string,
  roundId: string,
  viewerId: string,
): Promise<Recap | null> {
  const supabase = await createClient();

  const { data: round } = await supabase
    .from('rounds')
    .select('id, name, status')
    .eq('id', roundId)
    .maybeSingle();
  if (!round) return null;

  const [{ data: components }, { data: definition }, { data: members }, { data: leagueSeason }] =
    await Promise.all([
      supabase.rpc('league_score_components', {
        p_league_season_id: leagueSeasonId,
        p_round_id: roundId,
      }),
      supabase.rpc('league_weights', { p_league_season_id: leagueSeasonId }),
      supabase
        .from('league_members')
        .select('user_id, joined_at, profiles ( username )')
        .eq('league_id', leagueId),
      supabase
        .from('league_seasons')
        .select('prize_scheme_id')
        .eq('id', leagueSeasonId)
        .maybeSingle(),
    ]);

  const rows = toComponentRows(components ?? []);
  // Nothing settled means there is no story to tell yet.
  if (rows.length === 0) return null;

  const parsed = definition ? ruleSetDefinitionSchema.safeParse(definition) : null;
  const weights = parsed?.success ? resolveWeights(parsed.data) : DEFAULT_WEIGHTS;

  const board = aggregateLeaderboard({
    components: rows,
    members: (members ?? []).map((m) => ({
      userId: m.user_id,
      username: m.profiles?.username ?? 'player',
      joinedAt: m.joined_at,
    })),
    weights,
    viewerId,
  });

  const winner = board[0] ?? null;
  const runnerUp = board[1] ?? null;

  // The stories. Each one is only told when the data actually supports it — a recap that
  // invents a "shocker" every week stops meaning anything.
  const stories: RecapStory[] = [];

  const exactHitters = board.filter((row) => row.hits.exact > 0);
  if (exactHitters.length === 1 && exactHitters[0]) {
    stories.push({
      kind: 'call',
      title: 'Call of the week',
      body: `${exactHitters[0].username} was the only one to land an exact scoreline.`,
    });
  }

  const nobodyCalled = board.every((row) => row.hits.outcome === 0);
  if (nobodyCalled && board.some((row) => row.submissions > 0)) {
    stories.push({
      kind: 'shocker',
      title: 'Shocker',
      body: 'Not one correct outcome in the whole league. The room went quiet.',
    });
  }

  const you = board.find((row) => row.isYou);
  if (you) {
    stories.push({
      kind: 'table',
      title: 'Where you landed',
      body:
        you.rank === 1
          ? `Top of the week on ${you.points} points. Enjoy it.`
          : `${you.rank}${ordinal(you.rank)} this week on ${you.points} points${
              board[0] ? `, ${board[0].points - you.points} behind ${board[0].username}` : ''
            }.`,
    });
  }

  return {
    roundId,
    roundName: round.name,
    settledAt: null,
    winner: winner
      ? { username: winner.username, points: winner.points, isYou: winner.isYou }
      : null,
    runnerUp: runnerUp ? { username: runnerUp.username, points: runnerUp.points } : null,
    totals: {
      leaguePoints: board.reduce((sum, row) => sum + row.points, 0),
      exactScores: board.reduce((sum, row) => sum + row.hits.exact, 0),
      members: board.length,
    },
    stories,
    standings: board.map((row) => ({
      username: row.username,
      points: row.points,
      rank: row.rank,
      isYou: row.isYou,
    })),
    hasPrizes: leagueSeason?.prize_scheme_id != null,
  };
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}
