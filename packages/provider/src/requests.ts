import type { SeasonRef } from './adapter';

/**
 * The request each provider call makes, as data rather than as code inside the HTTP client.
 *
 * This exists so the live adapter and the replay adapter cannot drift. A cassette is
 * identified by (endpoint, paramsHash); if the replay adapter rebuilt those strings
 * independently, a one-character change to a query parameter here would silently stop
 * every cassette matching, and the tests would fail in a way that looks like a normalizer
 * bug rather than a lookup miss. Both sides now derive the key from this one table.
 */

export interface ProviderRequest {
  endpoint: string;
  params: Record<string, string | number>;
}

export const requests = {
  teams: (season: SeasonRef): ProviderRequest => ({
    endpoint: '/teams',
    params: { league: season.leagueProviderId, season: season.seasonYear },
  }),

  // Squads are per-team and not season-scoped in API-Football's own parameters, which is
  // why the season is unused here — kept in the signature so callers stay uniform.
  squad: (_season: SeasonRef, teamProviderId: string): ProviderRequest => ({
    endpoint: '/players/squads',
    params: { team: teamProviderId },
  }),

  fixtures: (season: SeasonRef): ProviderRequest => ({
    endpoint: '/fixtures',
    params: { league: season.leagueProviderId, season: season.seasonYear },
  }),

  fixture: (fixtureProviderId: string): ProviderRequest => ({
    endpoint: '/fixtures',
    params: { id: fixtureProviderId },
  }),

  liveFixtures: (season: SeasonRef): ProviderRequest => ({
    endpoint: '/fixtures',
    params: { league: season.leagueProviderId, season: season.seasonYear, live: 'all' },
  }),

  events: (fixtureProviderId: string): ProviderRequest => ({
    endpoint: '/fixtures/events',
    params: { fixture: fixtureProviderId },
  }),

  standings: (season: SeasonRef): ProviderRequest => ({
    endpoint: '/standings',
    params: { league: season.leagueProviderId, season: season.seasonYear },
  }),

  topScorers: (season: SeasonRef): ProviderRequest => ({
    endpoint: '/players/topscorers',
    params: { league: season.leagueProviderId, season: season.seasonYear },
  }),
} as const;

/**
 * Deterministic params hash for the raw_payloads archive and for cassette filenames, so a
 * recorded response can be found again by the call that would produce it.
 *
 * FNV-1a: not cryptographic, and does not need to be. It only has to be stable across
 * processes and versions, which rules out anything involving object key order or JSON
 * stringification of a Map.
 */
export function stableHash(params: Record<string, string | number>): string {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** `/fixtures/events` + {fixture:123} → `fixtures-events.4f2a1b09`. Safe as a filename. */
export function cassetteName(request: ProviderRequest): string {
  const slug = request.endpoint.replace(/^\//, '').replace(/\//g, '-');
  return `${slug}.${stableHash(request.params)}`;
}
