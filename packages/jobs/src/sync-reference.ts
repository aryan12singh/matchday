import type { Database } from '@matchday/domain';
import type { ProviderAdapter, SeasonRef } from '@matchday/provider';
import type { SupabaseClient } from '@supabase/supabase-js';

import { archiveRawPayload } from './bootstrap';
import { resolveEntity } from './entity-map';
import { withAdvisoryLock } from './locks';
import { runJob } from './sync-runs';

type Db = SupabaseClient<Database>;

/**
 * League table and top scorers.
 *
 * Nothing wrote either table before this existed, which meant two screens were reading
 * from permanently empty tables: /table, and the season-long Golden Boot market.
 *
 * The season table also has a second, less obvious job. It is a competition in its own
 * right (invariant 8 — lowest total displacement wins), and `current_table_order` reads
 * `standings` to score it. Without a standings sync the table race is not merely unshown,
 * it is unscoreable.
 *
 * Both are cheap — one request each — and neither changes during a match in a way anyone
 * needs within the minute, so the tick runs this well after the last final whistle rather
 * than alongside the live poll.
 */

export interface SyncReferenceOptions {
  seasonId: string;
  seasonRef: SeasonRef;
  /** Skipped until any fixture has been played — a pre-season table is 20 rows of zeroes. */
  skipIfUnplayed?: boolean;
}

export interface SyncReferenceResult {
  standingsRows: number;
  scorersRows: number;
  skipped: boolean;
}

export async function syncReference(
  client: Db,
  adapter: ProviderAdapter,
  options: SyncReferenceOptions,
): Promise<SyncReferenceResult | null> {
  return withAdvisoryLock(client, `sync:reference:${options.seasonId}`, () =>
    runJob(client, 'sync_reference', 'tick', { season_id: options.seasonId }, async () => {
      const empty: SyncReferenceResult = { standingsRows: 0, scorersRows: 0, skipped: true };

      if (options.skipIfUnplayed) {
        const { count } = await client
          .from('fixtures')
          .select('id, rounds!fixtures_round_id_fkey!inner ( stages!inner ( season_id ) )', {
            count: 'exact',
            head: true,
          })
          .eq('rounds.stages.season_id', options.seasonId)
          .in('status', ['finished', 'settled']);

        if ((count ?? 0) === 0) {
          return { result: empty, recordsRead: 0, recordsWritten: 0 };
        }
      }

      // The stage every league standing belongs to. Cup formats would need the group too;
      // the unique index is (stage_id, stage_group_id, team_id) with NULLS NOT DISTINCT,
      // so a null group collides correctly for a straight league.
      const { data: stage } = await client
        .from('stages')
        .select('id')
        .eq('season_id', options.seasonId)
        .order('sequence', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!stage) return { result: empty, recordsRead: 0, recordsWritten: 0 };

      const result: SyncReferenceResult = { standingsRows: 0, scorersRows: 0, skipped: false };

      // --- table ------------------------------------------------------------
      const standings = await adapter.listStandings(options.seasonRef);
      await archiveRawPayload(client, adapter.name, standings);

      const standingRows = [];
      for (const row of standings.data) {
        const teamId = await resolveEntity(client, adapter.name, 'team', row.teamProviderId);
        if (!teamId) continue;

        standingRows.push({
          season_id: options.seasonId,
          stage_id: stage.id,
          stage_group_id: null,
          team_id: teamId,
          position: row.position,
          played: row.played,
          won: row.won,
          drawn: row.drawn,
          lost: row.lost,
          goals_for: row.goalsFor,
          goals_against: row.goalsAgainst,
          points: row.points,
          form: row.form,
        });
      }

      if (standingRows.length > 0) {
        const { error } = await client
          .from('standings')
          .upsert(standingRows, { onConflict: 'stage_id,stage_group_id,team_id' });
        if (error) throw error;
        result.standingsRows = standingRows.length;
      }

      // --- top scorers ------------------------------------------------------
      const scorers = await adapter.listTopScorers(options.seasonRef);
      await archiveRawPayload(client, adapter.name, scorers);

      const scorerRows = [];
      for (const scorer of scorers.data) {
        // Only players the bootstrap already knows. Creating a player here would mean
        // inventing one from a stats row with no squad context, and the Golden Boot picker
        // searches squads — a player who exists only in this table could never be picked.
        const playerId = await resolveEntity(client, adapter.name, 'player', scorer.playerProviderId);
        if (!playerId) continue;

        const teamId = scorer.teamProviderId
          ? await resolveEntity(client, adapter.name, 'team', scorer.teamProviderId)
          : null;

        scorerRows.push({
          season_id: options.seasonId,
          player_id: playerId,
          team_id: teamId,
          goals: scorer.goals,
        });
      }

      if (scorerRows.length > 0) {
        const { error } = await client
          .from('season_player_stats')
          .upsert(scorerRows, { onConflict: 'season_id,player_id' });
        if (error) throw error;
        result.scorersRows = scorerRows.length;
      }

      return {
        result,
        recordsRead: standings.data.length + scorers.data.length,
        recordsWritten: result.standingsRows + result.scorersRows,
      };
    }),
  );
}
