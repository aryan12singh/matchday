import type { Database } from '@matchday/domain';
import type { ScheduleProvider, SeasonRef } from '@matchday/provider';
import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveOrCreate } from './entity-map';
import { withAdvisoryLock } from './locks';
import { runJob } from './sync-runs';

type Db = SupabaseClient<Database>;

/**
 * Season bootstrap — competition, season, stage, rounds, teams, squads, fixtures, and the
 * markets that hang off them.
 *
 * Idempotent by construction (invariant 5): every write is either a resolve-or-create
 * through provider_entity_map or a natural-key upsert, so running it twice over the same
 * season changes nothing. That matters more than it sounds — the first real run will be
 * against live PL data days before launch, and "run it again" needs to be a safe answer.
 */

export interface BootstrapOptions {
  competitionCode: string;
  competitionName: string;
  seasonLabel: string;
  seasonRef: SeasonRef;
  /** Skip squads on the free tier: one request per team is 20 of a 100/day budget. */
  includeSquads?: boolean;
}

export interface BootstrapResult {
  seasonId: string;
  teams: number;
  fixtures: number;
  rounds: number;
  markets: number;
}

export async function bootstrapSeason(
  client: Db,
  adapter: ScheduleProvider,
  options: BootstrapOptions,
): Promise<BootstrapResult | null> {
  return withAdvisoryLock(client, `bootstrap:${options.competitionCode}:${options.seasonLabel}`, () =>
    runJob(client, 'sync_season_bootstrap', 'admin', { season: options.seasonLabel }, async () => {
      const provider = adapter.name;

      // --- competition + season + stage ------------------------------------
      const { data: competition } = await client
        .from('competitions')
        .upsert(
          { code: options.competitionCode, name: options.competitionName, kind: 'league' },
          { onConflict: 'code' },
        )
        .select('id')
        .single();

      const competitionId = competition!.id;

      const { data: season } = await client
        .from('seasons')
        .upsert(
          {
            competition_id: competitionId,
            label: options.seasonLabel,
            status: 'upcoming',
            is_current: true,
          },
          { onConflict: 'competition_id,label' },
        )
        .select('id')
        .single();

      const seasonId = season!.id;

      const { data: stage } = await client
        .from('stages')
        .upsert(
          { season_id: seasonId, name: 'Regular Season', kind: 'round_robin', sequence: 1 },
          { onConflict: 'season_id,sequence' },
        )
        .select('id')
        .single();

      const stageId = stage!.id;

      // --- teams ------------------------------------------------------------
      const teamsResponse = await adapter.listTeams(options.seasonRef);
      await archive(client, provider, teamsResponse);

      const teamIdByProviderId = new Map<string, string>();

      for (const team of teamsResponse.data) {
        const internalId = await resolveOrCreate(client, provider, 'team', team.providerId, async () => {
          const { data, error } = await client
            .from('teams')
            .insert({
              name: team.name,
              short_name: team.shortName,
              code: team.code,
              country: team.country,
              crest_url: team.crestUrl,
            })
            .select('id')
            .single();
          if (error) throw error;
          return data.id;
        });

        teamIdByProviderId.set(team.providerId, internalId);

        await client
          .from('team_season_entries')
          .upsert({ season_id: seasonId, team_id: internalId }, { onConflict: 'season_id,team_id' });
      }

      // --- squads -----------------------------------------------------------
      if (options.includeSquads) {
        for (const [providerTeamId, teamId] of teamIdByProviderId) {
          const squad = await adapter.listSquad(options.seasonRef, providerTeamId);
          await archive(client, provider, squad);

          for (const player of squad.data) {
            const playerId = await resolveOrCreate(
              client,
              provider,
              'player',
              player.providerId,
              async () => {
                const { data, error } = await client
                  .from('players')
                  .insert({
                    full_name: player.fullName,
                    known_as: player.knownAs,
                    position: player.position,
                    nationality: player.nationality,
                    photo_url: player.photoUrl,
                  })
                  .select('id')
                  .single();
                if (error) throw error;
                return data.id;
              },
            );

            await client.from('squad_memberships').upsert(
              {
                player_id: playerId,
                team_id: teamId,
                season_id: seasonId,
                shirt_number: player.shirtNumber,
                position: player.position,
              },
              { onConflict: 'player_id,team_id,season_id' },
            );
          }
        }
      }

      // --- rounds + fixtures -------------------------------------------------
      const fixturesResponse = await adapter.listFixtures(options.seasonRef);
      await archive(client, provider, fixturesResponse);

      const roundIdByNumber = new Map<number, string>();
      let fixtureCount = 0;

      for (const fixture of fixturesResponse.data) {
        // A fixture with no parseable round number cannot be placed in a matchweek, and
        // guessing would put it in the wrong one. Skipped and counted, not silently
        // dropped — the run's totals will show the discrepancy.
        if (fixture.roundNumber == null) continue;

        let roundId = roundIdByNumber.get(fixture.roundNumber);
        if (!roundId) {
          const { data: round } = await client
            .from('rounds')
            .upsert(
              {
                stage_id: stageId,
                number: fixture.roundNumber,
                name: `Matchweek ${fixture.roundNumber}`,
              },
              { onConflict: 'stage_id,number' },
            )
            .select('id')
            .single();

          roundId = round!.id;
          roundIdByNumber.set(fixture.roundNumber, roundId);
        }

        const homeTeamId = teamIdByProviderId.get(fixture.homeTeamProviderId);
        const awayTeamId = teamIdByProviderId.get(fixture.awayTeamProviderId);
        if (!homeTeamId || !awayTeamId) continue;

        const fixtureId = await resolveOrCreate(
          client,
          provider,
          'fixture',
          fixture.providerId,
          async () => {
            const { data, error } = await client
              .from('fixtures')
              .insert({
                round_id: roundId!,
                home_team_id: homeTeamId,
                away_team_id: awayTeamId,
                kickoff_at: fixture.kickoffAt,
                status: fixture.status === 'awarded' ? 'awarded' : fixture.status,
                venue: fixture.venue,
              })
              .select('id')
              .single();
            if (error) throw error;
            return data.id;
          },
        );

        // A reschedule moves the kickoff and the round; predictions never migrate or
        // reset (05-domain-model.md), and ensure_fixture_markets below moves the locks.
        await client
          .from('fixtures')
          .update({ kickoff_at: fixture.kickoffAt, round_id: roundId, venue: fixture.venue })
          .eq('id', fixtureId);

        await client.rpc('ensure_fixture_markets', { p_fixture_id: fixtureId });
        fixtureCount += 1;
      }

      // Season markets lock at the season's first kickoff, which is only knowable once
      // the fixtures exist — so this must come last.
      await client.rpc('ensure_season_markets', { p_season_id: seasonId });

      const { count: marketCount } = await client
        .from('markets')
        .select('id', { count: 'exact', head: true })
        .eq('season_id', seasonId);

      return {
        result: {
          seasonId,
          teams: teamIdByProviderId.size,
          fixtures: fixtureCount,
          rounds: roundIdByNumber.size,
          markets: marketCount ?? 0,
        },
        recordsRead: teamsResponse.data.length + fixturesResponse.data.length,
        recordsWritten: fixtureCount + teamIdByProviderId.size,
      };
    }),
  );
}

/**
 * Archives a provider response before anything interprets it (invariant 1).
 *
 * On a prepaid quota this is what makes a normalizer bug survivable: fix the normalizer,
 * replay the archive. Without it the only recovery is to ask the provider again, which
 * during a matchday may not be possible.
 */
async function archive(
  client: Db,
  provider: string,
  response: { raw: unknown; endpoint: string; paramsHash: string; httpStatus: number },
): Promise<void> {
  await client.from('raw_payloads').insert({
    provider,
    endpoint: response.endpoint,
    params_hash: response.paramsHash,
    http_status: response.httpStatus,
    payload: response.raw as never,
  });
}

export { archive as archiveRawPayload };
