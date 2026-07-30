import type { Database } from '@matchday/domain';
import type { ProviderAdapter, ProviderFixture, SeasonRef } from '@matchday/provider';
import type { SupabaseClient } from '@supabase/supabase-js';

import { archiveRawPayload } from './bootstrap';
import { resolveEntity } from './entity-map';
import { withAdvisoryLock } from './locks';
import { runJob } from './sync-runs';

type Db = SupabaseClient<Database>;
type FixtureUpdate = Database['public']['Tables']['fixtures']['Update'];

/**
 * Fixture schedule sync.
 *
 * The bootstrap loads the season once; this keeps it true. Between then and May, fixtures
 * move — TV picks, cup progression, weather, and in the Premier League a steady drip of
 * rearranged midweek games.
 *
 * A moved kickoff is not a cosmetic update. `markets.locks_at` is derived from it, and the
 * lock is enforced in the database (invariant 3), so a fixture that moves earlier without
 * its markets moving too would leave predictions editable after the whistle. That is why
 * every kickoff change re-runs `ensure_fixture_markets`, and why this job exists at all
 * rather than being folded into the live sync.
 *
 * What deliberately does NOT happen on a reschedule: predictions are never migrated,
 * reset or invalidated (05-domain-model.md). The pick stands; only the deadline moves.
 */

export interface SyncFixturesOptions {
  seasonId: string;
  seasonRef: SeasonRef;
  /** Only touch fixtures kicking off within this many days. Omit for the whole season. */
  horizonDays?: number;
}

export interface SyncFixturesResult {
  seen: number;
  rescheduled: number;
  roundChanged: number;
  statusChanged: number;
  created: number;
  unmatched: number;
}

export async function syncFixtures(
  client: Db,
  adapter: ProviderAdapter,
  options: SyncFixturesOptions,
): Promise<SyncFixturesResult | null> {
  return withAdvisoryLock(client, `sync:fixtures:${options.seasonId}`, () =>
    runJob(client, 'sync_fixtures', 'tick', { season_id: options.seasonId }, async () => {
      const response = await adapter.listFixtures(options.seasonRef);
      await archiveRawPayload(client, adapter.name, response);

      const result: SyncFixturesResult = {
        seen: 0,
        rescheduled: 0,
        roundChanged: 0,
        statusChanged: 0,
        created: 0,
        unmatched: 0,
      };

      const horizonMs =
        options.horizonDays != null ? options.horizonDays * 24 * 60 * 60 * 1000 : null;
      const now = Date.now();

      for (const incoming of response.data) {
        if (incoming.roundNumber == null) continue;

        if (horizonMs != null) {
          const delta = new Date(incoming.kickoffAt).getTime() - now;
          // Past fixtures are still in range: a result correction days later has to land.
          if (delta > horizonMs) continue;
        }

        result.seen += 1;

        const fixtureId = await resolveEntity(client, adapter.name, 'fixture', incoming.providerId);
        if (!fixtureId) {
          // A fixture the bootstrap never saw. Creating it here would need team resolution
          // and round creation, duplicating bootstrap for a case that means something is
          // wrong — a mid-season expansion, or the wrong season ref. Counted so /ops shows
          // it rather than it passing unnoticed.
          result.unmatched += 1;
          continue;
        }

        const { data: current } = await client
          .from('fixtures')
          .select('id, kickoff_at, round_id, status, venue, manual_override')
          .eq('id', fixtureId)
          .single();

        if (!current) {
          result.unmatched += 1;
          continue;
        }

        // An operator correcting a fixture by hand outranks the provider, or /ops fixes
        // would be reverted within the minute.
        if (current.manual_override) continue;

        const patch: FixtureUpdate = {};

        const kickoffMoved =
          new Date(current.kickoff_at).getTime() !== new Date(incoming.kickoffAt).getTime();
        if (kickoffMoved) {
          patch.kickoff_at = incoming.kickoffAt;
          result.rescheduled += 1;
        }

        const roundId = await roundIdForNumber(client, options.seasonId, incoming.roundNumber);
        if (roundId && roundId !== current.round_id) {
          patch.round_id = roundId;
          result.roundChanged += 1;
        }

        // Status here only ever moves a fixture *towards* kickoff or into an abandonment.
        // Scores and live minutes belong to sync-live and sync-final: this job runs off the
        // season-wide list, which lags the live feed, and letting it write scores would
        // let a stale list overwrite a fresher live update.
        const incomingStatus = mapStatus(incoming.status);
        if (incomingStatus !== current.status && shouldAcceptStatus(current.status, incomingStatus)) {
          patch.status = incomingStatus;
          result.statusChanged += 1;
        }

        if (incoming.venue && incoming.venue !== current.venue) patch.venue = incoming.venue;

        if (Object.keys(patch).length === 0) continue;

        const { error } = await client.from('fixtures').update(patch).eq('id', fixtureId);
        if (error) throw error;

        // The whole reason this job is not just a status poller: locks follow kickoffs.
        if (kickoffMoved) {
          await client.rpc('ensure_fixture_markets', { p_fixture_id: fixtureId });
        }
      }

      return {
        result,
        recordsRead: response.data.length,
        recordsWritten: result.rescheduled + result.roundChanged + result.statusChanged,
      };
    }),
  );
}

/** Provider status → our fixture status. 'awarded' is the only name that differs. */
function mapStatus(status: ProviderFixture['status']): string {
  return status === 'awarded' ? 'awarded' : status;
}

/**
 * Guards the one transition that must never be automatic: settled → anything.
 *
 * Once a fixture is settled its points are in the leaderboard. Walking it back to 'live'
 * because a season-wide list was cached would unsettle a matchweek. A genuine correction
 * arrives through sync-final, which re-settles deliberately and writes a diff.
 */
function shouldAcceptStatus(current: string, incoming: string): boolean {
  if (current === 'settled') return false;
  // Never regress a finished fixture to a pre-match state on a stale list read.
  if (current === 'finished' && (incoming === 'scheduled' || incoming === 'lineups')) return false;
  return true;
}

const roundCache = new Map<string, string>();

async function roundIdForNumber(
  client: Db,
  seasonId: string,
  number: number,
): Promise<string | null> {
  const key = `${seasonId}:${number}`;
  const cached = roundCache.get(key);
  if (cached) return cached;

  const { data } = await client
    .from('rounds')
    .select('id, stages!inner ( season_id )')
    .eq('stages.season_id', seasonId)
    .eq('number', number)
    .maybeSingle();

  if (data?.id) {
    roundCache.set(key, data.id);
    return data.id;
  }
  return null;
}

/** Exposed for tests: the cache is process-lifetime and would leak between cases. */
export function __clearRoundCache(): void {
  roundCache.clear();
}
