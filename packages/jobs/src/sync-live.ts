import type { Database } from '@matchday/domain';
import type { ProviderAdapter, ProviderEvent, SeasonRef } from '@matchday/provider';
import type { SupabaseClient } from '@supabase/supabase-js';

import { archiveRawPayload } from './bootstrap';
import { resolveEntity } from './entity-map';
import { withAdvisoryLock } from './locks';
import { reconcileFixtures } from './reconcile';
import { runJob } from './sync-runs';

type Db = SupabaseClient<Database>;

/**
 * Live sync — scores, minutes and the event stream for matches in progress.
 *
 * One list call covers every live fixture in the competition, then one events call per
 * live fixture. On a Saturday with five concurrent 3pm kickoffs that is six requests per
 * poll, which is the number the windowing in tick.ts is built around: this job is cheap
 * per call and ruinous if run on a loop all day.
 *
 * Events are the load-bearing part. First-goalscorer and first-scoring-team cannot be
 * derived from a scoreline, so a settled fixture with no events would silently score every
 * first-scorer pick as a miss. That is a wrong answer rather than a missing one, which is
 * why events are ingested continuously rather than fetched once at full time.
 */

export interface SyncLiveOptions {
  seasonId: string;
  seasonRef: SeasonRef;
  /** Skip the per-fixture events call — used when quota is nearly exhausted. */
  scoresOnly?: boolean;
}

export interface SyncLiveResult {
  liveFixtures: number;
  updated: number;
  eventsWritten: number;
  unmatched: number;
  /** Fixtures linked to this provider for the first time on this run. */
  linked: number;
}

export async function syncLive(
  client: Db,
  adapter: ProviderAdapter,
  options: SyncLiveOptions,
): Promise<SyncLiveResult | null> {
  return withAdvisoryLock(client, `sync:live:${options.seasonId}`, () =>
    runJob(client, 'sync_live', 'tick', { season_id: options.seasonId }, async () => {
      const response = await adapter.listLiveFixtures(options.seasonRef);
      await archiveRawPayload(client, adapter.name, response);

      const result: SyncLiveResult = {
        liveFixtures: response.data.length,
        updated: 0,
        eventsWritten: 0,
        unmatched: 0,
        linked: 0,
      };

      // Link anything this provider has never been seen to before reading it. The season
      // is loaded from the Premier League's own JSON, so on the first matchday every
      // incoming fixture is an unknown id — without this the whole run is a no-op, and a
      // silent one.
      const reconciled = await reconcileFixtures(
        client,
        adapter.name,
        options.seasonId,
        response.data,
      );
      result.linked = reconciled.linked;

      for (const incoming of response.data) {
        const fixtureId = await resolveEntity(client, adapter.name, 'fixture', incoming.providerId);
        if (!fixtureId) {
          result.unmatched += 1;
          continue;
        }

        const { data: current } = await client
          .from('fixtures')
          .select('id, status, manual_override')
          .eq('id', fixtureId)
          .single();

        if (!current || current.manual_override) continue;

        // Settled fixtures are not reopened by a live feed. If the provider genuinely
        // revises a finished result, sync-final's correction path handles it deliberately.
        if (current.status === 'settled') continue;

        const { error } = await client
          .from('fixtures')
          .update({
            status: incoming.status === 'awarded' ? 'awarded' : incoming.status,
            minute: incoming.minute,
            home_score: incoming.homeScore,
            away_score: incoming.awayScore,
            ht_home: incoming.htHome,
            ht_away: incoming.htAway,
          })
          .eq('id', fixtureId);
        if (error) throw error;
        result.updated += 1;

        if (!options.scoresOnly) {
          const events = await adapter.listEvents(incoming.providerId);
          await archiveRawPayload(client, adapter.name, events);
          result.eventsWritten += await writeEvents(client, adapter.name, fixtureId, events.data);
        }
      }

      return {
        result,
        recordsRead: response.data.length,
        recordsWritten: result.updated + result.eventsWritten,
      };
    }),
  );
}

/**
 * Upserts the event stream for one fixture.
 *
 * Keyed on (fixture_id, provider_event_key) so re-ingesting the same minute — which
 * happens on every single poll — updates in place instead of stacking duplicates. A
 * duplicated goal event would not just look wrong: `firstGoal()` sorts by minute, so
 * duplicates are harmless there, but the events feed the match page and any count of them
 * would drift upward all afternoon.
 *
 * Teams and players are resolved through provider_entity_map. An unresolvable player is
 * kept as an event with a null player_id rather than dropped: a goal that exists with an
 * unknown scorer is closer to the truth than no goal at all, and the scoreline would
 * otherwise disagree with the event list.
 */
export async function writeEvents(
  client: Db,
  provider: string,
  fixtureId: string,
  events: readonly ProviderEvent[],
): Promise<number> {
  if (events.length === 0) return 0;

  const rows = [];

  for (const event of events) {
    const teamId = event.teamProviderId
      ? await resolveEntity(client, provider, 'team', event.teamProviderId)
      : null;
    const playerId = event.playerProviderId
      ? await resolveEntity(client, provider, 'player', event.playerProviderId)
      : null;
    const assistId = event.assistPlayerProviderId
      ? await resolveEntity(client, provider, 'player', event.assistPlayerProviderId)
      : null;

    rows.push({
      fixture_id: fixtureId,
      provider_event_key: event.providerEventKey,
      type: event.type,
      minute: event.minute,
      added_min: event.addedMinute,
      team_id: teamId,
      player_id: playerId,
      assist_player_id: assistId,
    });
  }

  const { error } = await client
    .from('fixture_events')
    .upsert(rows, { onConflict: 'fixture_id,provider_event_key' });
  if (error) throw error;

  return rows.length;
}
