import 'server-only';

import {
  type RuleSetDefinition,
  DEFAULT_WEIGHTS,
  resolveWeights,
  ruleSetDefinitionSchema,
} from '@matchday/domain';
import {
  type LeaderboardMember,
  type LeaderboardRow,
  type TableRaceEntry,
  aggregateLeaderboard,
  rankTableRace,
  toComponentRows,
  scoreSeasonTable,
} from '@matchday/scoring';

import { createClient } from './supabase/server';

/**
 * Leaderboard assembly. The database filters to the markets that count for the league
 * (invariant 7) and returns raw hits; valuation and ordering happen here through
 * packages/scoring, so the tiebreak chain has exactly one implementation.
 */

export interface LeaderboardView {
  rows: LeaderboardRow[];
  /** The rule-set weights this board was computed under, for the rules panel. */
  weights: Record<string, number>;
}

export async function getLeaderboard({
  leagueSeasonId,
  leagueId,
  viewerId,
  roundId = null,
  roundNumber = null,
}: {
  leagueSeasonId: string;
  leagueId: string;
  viewerId: string;
  roundId?: string | null;
  roundNumber?: number | null;
}): Promise<LeaderboardView> {
  const supabase = await createClient();

  const [{ data: components }, { data: definition }, { data: members }] = await Promise.all([
    supabase.rpc('league_score_components', {
      p_league_season_id: leagueSeasonId,
      p_round_id: roundId ?? undefined,
    }),
    supabase.rpc('league_weights', {
      p_league_season_id: leagueSeasonId,
      p_round_number: roundNumber ?? undefined,
    }),
    supabase
      .from('league_members')
      .select('user_id, joined_at, profiles ( username, avatar_url )')
      .eq('league_id', leagueId),
  ]);

  // A league with no binding would score everyone zero, which reads as a scoring bug.
  // enrol_league_season always binds v1, so falling back here is belt and braces.
  const parsed = definition ? ruleSetDefinitionSchema.safeParse(definition) : null;
  const weights =
    parsed?.success === true ? resolveWeights(parsed.data as RuleSetDefinition) : DEFAULT_WEIGHTS;

  const rows = aggregateLeaderboard({
    components: toComponentRows(components ?? []),
    members: (members ?? []).map(
      (m): LeaderboardMember => ({
        userId: m.user_id,
        username: m.profiles?.username ?? 'player',
        avatarUrl: m.profiles?.avatar_url ?? null,
        joinedAt: m.joined_at,
      }),
    ),
    weights,
    viewerId,
  });

  return { rows, weights };
}

export interface TableRaceRowView {
  userId: string;
  username: string;
  rank: number;
  totalAbs: number;
  exactHits: number;
  championHit: boolean;
  biggestMiss: { teamId: string; diff: number } | null;
  isYou: boolean;
}

/**
 * The Table race board — a separate, lowest-wins competition (invariant 8). Never merged
 * into weekly or overall points.
 *
 * Before the season's first kickoff this is empty by design: entries are still open, and
 * table_race_entries deliberately excludes unlocked predictions so nobody can copy the
 * best-informed guess.
 */
export async function getTableRace({
  leagueSeasonId,
  seasonId,
  viewerId,
}: {
  leagueSeasonId: string;
  seasonId: string;
  viewerId: string;
}): Promise<{ rows: TableRaceRowView[]; provisional: boolean }> {
  const supabase = await createClient();

  const [{ data: entries }, { data: actualOrder }] = await Promise.all([
    supabase.rpc('table_race_entries', { p_league_season_id: leagueSeasonId }),
    supabase.rpc('current_table_order', { p_season_id: seasonId }),
  ]);

  // No standings yet means nothing to measure against.
  if (!actualOrder || actualOrder.length === 0 || !entries || entries.length === 0) {
    return { rows: [], provisional: true };
  }

  const outcome = { order: actualOrder as never };

  const scored: TableRaceEntry[] = entries.map((entry) => ({
    userId: entry.user_id,
    joinedAt: entry.joined_at,
    score: scoreSeasonTable(
      { order: (entry.predicted_order ?? []) as never },
      outcome,
    ),
  }));

  const usernames = new Map(entries.map((e) => [e.user_id, e.username]));

  return {
    rows: rankTableRace(scored).map((row) => ({
      userId: row.userId,
      username: usernames.get(row.userId) ?? 'player',
      rank: row.rank,
      totalAbs: row.score.totalAbs,
      exactHits: row.score.exactHits,
      championHit: row.score.championHit,
      biggestMiss: row.score.biggestMiss,
      isYou: row.userId === viewerId,
    })),
    // Until the final matchweek confirms, this is "if the season ended today".
    provisional: true,
  };
}
