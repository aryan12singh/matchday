import { type Database, DEFAULT_WEIGHTS, resolveWeights, ruleSetDefinitionSchema } from '@matchday/domain';
import { aggregateLeaderboard, toComponentRows } from '@matchday/scoring';
import type { SupabaseClient } from '@supabase/supabase-js';

type Db = SupabaseClient<Database>;

/**
 * Rank snapshots, written after a round settles.
 *
 * These are what movement arrows and the points-race chart read. They have to be written
 * at settlement rather than derived on the fly, because "where were you last week" is not
 * recoverable from current state once weights or selections change — the whole point of
 * a snapshot is that it records what was true then, not what the same inputs would
 * produce now.
 */
export async function snapshotRanks(client: Db): Promise<number> {
  const { data: leagueSeasons } = await client
    .from('league_seasons')
    .select('id, league_id, season_id')
    .eq('status', 'active');

  let written = 0;

  for (const leagueSeason of leagueSeasons ?? []) {
    const [{ data: components }, { data: definition }, { data: members }] = await Promise.all([
      client.rpc('league_score_components', { p_league_season_id: leagueSeason.id }),
      client.rpc('league_weights', { p_league_season_id: leagueSeason.id }),
      client
        .from('league_members')
        .select('user_id, joined_at, profiles ( username )')
        .eq('league_id', leagueSeason.league_id),
    ]);

    if (!components || components.length === 0) continue;

    const parsed = definition ? ruleSetDefinitionSchema.safeParse(definition) : null;
    const weights = parsed?.success ? resolveWeights(parsed.data) : DEFAULT_WEIGHTS;

    const rows = aggregateLeaderboard({
      components: toComponentRows(components),
      members: (members ?? []).map((m) => ({
        userId: m.user_id,
        username: m.profiles?.username ?? 'player',
        joinedAt: m.joined_at,
      })),
      weights,
    });

    // The most recently completed round is what this snapshot is "as of".
    const { data: latestRound } = await client
      .from('rounds')
      .select('id, stages!inner ( season_id )')
      .eq('stages.season_id', leagueSeason.season_id)
      .eq('status', 'completed')
      .order('number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await client.from('rank_snapshots').insert(
      rows.map((row) => ({
        league_season_id: leagueSeason.id,
        user_id: row.userId,
        round_id: latestRound?.id ?? null,
        rank: row.rank,
        points: row.points,
      })),
    );

    if (!error) written += rows.length;
  }

  return written;
}
