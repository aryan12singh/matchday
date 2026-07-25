import 'server-only';

import { DEFAULT_WEIGHTS, resolveWeights, ruleSetDefinitionSchema } from '@matchday/domain';
import { aggregateLeaderboard, toComponentRows } from '@matchday/scoring';

import { createClient } from './supabase/server';

/**
 * League Home clubhouse — design/screens/League Home.dc.html.
 *
 * Standings, rivalry, records and the activity feed. All derived from what already
 * exists: there is no "records" table, because a stored record is a record that can drift
 * out of step with a correction rerun.
 */

export interface Clubhouse {
  standings: Array<{ userId: string; username: string; points: number; rank: number; isYou: boolean }>;
  rivalry: {
    you: { username: string; points: number };
    rival: { username: string; points: number };
    delta: number;
  } | null;
  records: Array<{ label: string; value: string; holder: string }>;
  feed: Array<{ id: string; type: string; body: string; occurredAt: string }>;
  lastWinner: { username: string; points: number; roundName: string } | null;
}

export async function getClubhouse(
  leagueSeasonId: string,
  leagueId: string,
  viewerId: string,
): Promise<Clubhouse> {
  const supabase = await createClient();

  const [{ data: components }, { data: definition }, { data: members }, { data: events }] =
    await Promise.all([
      supabase.rpc('league_score_components', { p_league_season_id: leagueSeasonId }),
      supabase.rpc('league_weights', { p_league_season_id: leagueSeasonId }),
      supabase
        .from('league_members')
        .select('user_id, joined_at, profiles ( username )')
        .eq('league_id', leagueId),
      supabase
        .from('league_events')
        .select('id, type, payload, occurred_at, profiles ( username )')
        .eq('league_id', leagueId)
        .order('occurred_at', { ascending: false })
        .limit(12),
    ]);

  const parsed = definition ? ruleSetDefinitionSchema.safeParse(definition) : null;
  const weights = parsed?.success ? resolveWeights(parsed.data) : DEFAULT_WEIGHTS;

  const board = aggregateLeaderboard({
    components: toComponentRows(components ?? []),
    members: (members ?? []).map((m) => ({
      userId: m.user_id,
      username: m.profiles?.username ?? 'player',
      joinedAt: m.joined_at,
    })),
    weights,
    viewerId,
  });

  const you = board.find((row) => row.isYou);
  // The rival is whoever is immediately adjacent — the person you are actually racing,
  // not an arbitrary pick. Above if there is someone above, otherwise below.
  const youIndex = you ? board.indexOf(you) : -1;
  const rival = you ? (board[youIndex - 1] ?? board[youIndex + 1] ?? null) : null;

  const records: Clubhouse['records'] = [];
  if (board.length > 0) {
    const mostExact = [...board].sort((a, b) => b.hits.exact - a.hits.exact)[0]!;
    if (mostExact.hits.exact > 0) {
      records.push({
        label: 'Most exact scorelines',
        value: String(mostExact.hits.exact),
        holder: mostExact.username,
      });
    }

    const bestAccuracy = [...board]
      .filter((row) => row.submissions >= 3)
      .sort((a, b) => b.accuracy - a.accuracy)[0];
    if (bestAccuracy) {
      records.push({
        label: 'Best outcome accuracy',
        value: `${bestAccuracy.accuracy}%`,
        holder: bestAccuracy.username,
      });
    }

    const mostScorers = [...board].sort((a, b) => b.hits.first_scorer - a.hits.first_scorer)[0]!;
    if (mostScorers.hits.first_scorer > 0) {
      records.push({
        label: 'First scorers called',
        value: String(mostScorers.hits.first_scorer),
        holder: mostScorers.username,
      });
    }
  }

  return {
    standings: board.slice(0, 5).map((row) => ({
      userId: row.userId,
      username: row.username,
      points: row.points,
      rank: row.rank,
      isYou: row.isYou,
    })),
    rivalry:
      you && rival
        ? {
            you: { username: you.username, points: you.points },
            rival: { username: rival.username, points: rival.points },
            delta: you.points - rival.points,
          }
        : null,
    records,
    feed: (events ?? []).map((event) => ({
      id: event.id,
      type: event.type,
      body: describeEvent(event.type, event.profiles?.username ?? null, event.payload),
      occurredAt: event.occurred_at,
    })),
    lastWinner: null,
  };
}

/** Feed copy. Unknown types degrade to something readable rather than a raw enum. */
function describeEvent(type: string, actor: string | null, payload: unknown): string {
  const who = actor ?? 'Someone';
  const data = (payload ?? {}) as Record<string, unknown>;

  switch (type) {
    case 'league_created':
      return `${who} started the league.`;
    case 'member_joined':
      return `${who} joined.`;
    case 'member_left':
      return `${who} left.`;
    case 'selection_finalized':
      return `${who} finalised the round — ${data.fixtures ?? 'the'} fixtures count.`;
    case 'selection_fallback':
      return 'Nobody finalised in time, so every fixture in the round counts.';
    default:
      return `${who} — ${type.replace(/_/g, ' ')}.`;
  }
}
