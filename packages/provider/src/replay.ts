import {
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderFixture,
  type ProviderPlayer,
  type ProviderStanding,
  type ProviderTeam,
  type ProviderTopScorer,
  type RawResponse,
  type SeasonRef,
  ProviderError,
} from './adapter';
import {
  normalizeEvents,
  normalizeFixtures,
  normalizeSquad,
  normalizeStandings,
  normalizeTeams,
  normalizeTopScorers,
} from './normalizers';
import { type ProviderRequest, cassetteName, requests, stableHash } from './requests';

/**
 * Cassette record/replay.
 *
 * Two problems, one mechanism:
 *
 *   1. The ingestion jobs cannot be developed against a live provider. The free tier is
 *      100 requests/day, and a job under development will burn that in one debugging
 *      session — so the pipeline needs a provider that costs nothing and returns the same
 *      bytes every time.
 *   2. When the API key does arrive (T6), the captured payloads have to become permanent
 *      test fixtures rather than a thing someone looked at once. Recording through the
 *      same key derivation the live adapter uses means a cassette is found by the call
 *      that produced it, with no manual filing.
 *
 * The replay adapter runs the *real* normalizers over stored payloads. That is the point:
 * it exercises everything except the socket, so a normalizer that mis-reads a shape fails
 * here rather than at 3pm on a Saturday.
 */

/** A recorded provider response, exactly as it came off the wire. */
export interface Cassette {
  endpoint: string;
  paramsHash: string;
  httpStatus: number;
  raw: unknown;
  /** When this was captured — a cassette recorded pre-season may not show live shapes. */
  recordedAt?: string;
  /** Set on hand-written payloads so a real capture can never be confused for one. */
  synthetic?: boolean;
}

export interface CassetteStore {
  get(name: string): Cassette | undefined;
  put(name: string, cassette: Cassette): void;
  names(): string[];
}

export class MemoryCassetteStore implements CassetteStore {
  private readonly map = new Map<string, Cassette>();

  constructor(entries: Record<string, Cassette> = {}) {
    for (const [name, cassette] of Object.entries(entries)) this.map.set(name, cassette);
  }

  get(name: string): Cassette | undefined {
    return this.map.get(name);
  }

  put(name: string, cassette: Cassette): void {
    this.map.set(name, cassette);
  }

  names(): string[] {
    return [...this.map.keys()].sort();
  }
}

/**
 * Serves recorded payloads through the real normalizers.
 *
 * A miss throws rather than returning empty. An adapter that quietly answers "no fixtures"
 * for an unrecorded call would let a job under test appear to succeed while doing nothing,
 * which is the single most misleading way for this to fail.
 */
export class ReplayAdapter implements ProviderAdapter {
  readonly name: string;

  constructor(
    private readonly store: CassetteStore,
    options: { name?: string } = {},
  ) {
    // Recorded under the live adapter's name so provider_entity_map rows created during a
    // replay match the ones a live run would create. Overridable for tests that want the
    // two kept apart.
    this.name = options.name ?? 'api-football';
  }

  private replay(request: ProviderRequest): RawResponse<unknown> {
    const name = cassetteName(request);
    const cassette = this.store.get(name);

    if (!cassette) {
      throw new ProviderError(
        `No cassette "${name}" for ${request.endpoint} ${JSON.stringify(request.params)}. ` +
          `Available: ${this.store.names().join(', ') || 'none'}`,
        404,
        request.endpoint,
      );
    }

    return {
      raw: cassette.raw,
      data: undefined,
      endpoint: cassette.endpoint,
      paramsHash: cassette.paramsHash,
      httpStatus: cassette.httpStatus,
    };
  }

  async listTeams(season: SeasonRef): Promise<RawResponse<ProviderTeam[]>> {
    const result = this.replay(requests.teams(season));
    return { ...result, data: normalizeTeams(result.raw) };
  }

  async listSquad(season: SeasonRef, teamProviderId: string): Promise<RawResponse<ProviderPlayer[]>> {
    const result = this.replay(requests.squad(season, teamProviderId));
    return { ...result, data: normalizeSquad(result.raw, teamProviderId) };
  }

  async listFixtures(season: SeasonRef): Promise<RawResponse<ProviderFixture[]>> {
    const result = this.replay(requests.fixtures(season));
    return { ...result, data: normalizeFixtures(result.raw) };
  }

  async getFixture(fixtureProviderId: string): Promise<RawResponse<ProviderFixture>> {
    const result = this.replay(requests.fixture(fixtureProviderId));
    const fixture = normalizeFixtures(result.raw)[0];
    if (!fixture) {
      throw new ProviderError(`Fixture ${fixtureProviderId} not in cassette`, 404, '/fixtures');
    }
    return { ...result, data: fixture };
  }

  async listLiveFixtures(season: SeasonRef): Promise<RawResponse<ProviderFixture[]>> {
    const result = this.replay(requests.liveFixtures(season));
    return { ...result, data: normalizeFixtures(result.raw) };
  }

  async listEvents(fixtureProviderId: string): Promise<RawResponse<ProviderEvent[]>> {
    const result = this.replay(requests.events(fixtureProviderId));
    return { ...result, data: normalizeEvents(result.raw, fixtureProviderId) };
  }

  async listStandings(season: SeasonRef): Promise<RawResponse<ProviderStanding[]>> {
    const result = this.replay(requests.standings(season));
    return { ...result, data: normalizeStandings(result.raw) };
  }

  async listTopScorers(season: SeasonRef): Promise<RawResponse<ProviderTopScorer[]>> {
    const result = this.replay(requests.topScorers(season));
    return { ...result, data: normalizeTopScorers(result.raw) };
  }
}

/**
 * Wraps a live adapter and records every response into a store (T6 capture).
 *
 * Delegating rather than re-fetching matters: what gets written is the exact payload the
 * caller received, so a cassette can never disagree with the run that produced it.
 */
export class RecordingAdapter implements ProviderAdapter {
  readonly name: string;

  constructor(
    private readonly inner: ProviderAdapter,
    private readonly store: CassetteStore,
  ) {
    this.name = inner.name;
  }

  private keep<T>(request: ProviderRequest, response: RawResponse<T>): RawResponse<T> {
    this.store.put(cassetteName(request), {
      endpoint: response.endpoint,
      paramsHash: response.paramsHash,
      httpStatus: response.httpStatus,
      raw: response.raw,
      recordedAt: new Date().toISOString(),
    });
    return response;
  }

  async listTeams(season: SeasonRef) {
    return this.keep(requests.teams(season), await this.inner.listTeams(season));
  }

  async listSquad(season: SeasonRef, teamProviderId: string) {
    return this.keep(
      requests.squad(season, teamProviderId),
      await this.inner.listSquad(season, teamProviderId),
    );
  }

  async listFixtures(season: SeasonRef) {
    return this.keep(requests.fixtures(season), await this.inner.listFixtures(season));
  }

  async getFixture(fixtureProviderId: string) {
    return this.keep(
      requests.fixture(fixtureProviderId),
      await this.inner.getFixture(fixtureProviderId),
    );
  }

  async listLiveFixtures(season: SeasonRef) {
    return this.keep(requests.liveFixtures(season), await this.inner.listLiveFixtures(season));
  }

  async listEvents(fixtureProviderId: string) {
    return this.keep(
      requests.events(fixtureProviderId),
      await this.inner.listEvents(fixtureProviderId),
    );
  }

  async listStandings(season: SeasonRef) {
    return this.keep(requests.standings(season), await this.inner.listStandings(season));
  }

  async listTopScorers(season: SeasonRef) {
    return this.keep(requests.topScorers(season), await this.inner.listTopScorers(season));
  }
}

/** Builds a cassette from a hand-written payload, flagged so it cannot pass as a capture. */
export function syntheticCassette(request: ProviderRequest, raw: unknown): Cassette {
  return {
    endpoint: request.endpoint,
    paramsHash: stableHash(request.params),
    httpStatus: 200,
    raw,
    synthetic: true,
  };
}
