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
import { type ProviderRequest, requests, stableHash } from './requests';

/**
 * API-Football v3 adapter (addendum §F: Pro plan, 7,500 req/day, 300 req/min).
 *
 * The HTTP surface is deliberately thin — one request method, everything else is
 * normalizers. That keeps the part that needs a live key and a real cassette as small as
 * possible, and it is why the normalizers can be tested without either.
 */

export interface ApiFootballOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Called before every request so the quota ledger can veto it. */
  onRequest?: (endpoint: string) => void | Promise<void>;
}

export class ApiFootballAdapter implements ProviderAdapter {
  readonly name = 'api-football';

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ApiFootballOptions) {
    this.baseUrl = options.baseUrl ?? 'https://v3.football.api-sports.io';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request({ endpoint, params }: ProviderRequest) {
    await this.options.onRequest?.(endpoint);

    const url = new URL(endpoint, this.baseUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const response = await this.fetchImpl(url, {
      headers: { 'x-apisports-key': this.options.apiKey },
    });

    if (!response.ok) {
      throw new ProviderError(
        `API-Football ${endpoint} returned ${response.status}`,
        response.status,
        endpoint,
      );
    }

    const raw = await response.json();

    // API-Football answers 200 with an `errors` object for quota and auth problems, so a
    // non-empty errors field is a failure even though the HTTP status says otherwise.
    const errors = (raw as { errors?: unknown }).errors;
    if (errors && typeof errors === 'object' && Object.keys(errors).length > 0) {
      throw new ProviderError(
        `API-Football ${endpoint}: ${JSON.stringify(errors)}`,
        // Reported as 429 so the breaker treats a quota stop as retryable-after-cooldown
        // rather than as a permanent failure.
        429,
        endpoint,
      );
    }

    return {
      raw,
      endpoint,
      paramsHash: stableHash(params),
      httpStatus: response.status,
    };
  }

  async listTeams(season: SeasonRef): Promise<RawResponse<ProviderTeam[]>> {
    const result = await this.request(requests.teams(season));
    return { ...result, data: normalizeTeams(result.raw) };
  }

  async listSquad(
    _season: SeasonRef,
    teamProviderId: string,
  ): Promise<RawResponse<ProviderPlayer[]>> {
    const result = await this.request(requests.squad(_season, teamProviderId));
    return { ...result, data: normalizeSquad(result.raw, teamProviderId) };
  }

  async listFixtures(season: SeasonRef): Promise<RawResponse<ProviderFixture[]>> {
    const result = await this.request(requests.fixtures(season));
    return { ...result, data: normalizeFixtures(result.raw) };
  }

  async getFixture(fixtureProviderId: string): Promise<RawResponse<ProviderFixture>> {
    const result = await this.request(requests.fixture(fixtureProviderId));
    const fixtures = normalizeFixtures(result.raw);
    const fixture = fixtures[0];
    if (!fixture) {
      throw new ProviderError(`Fixture ${fixtureProviderId} not found`, 404, '/fixtures');
    }
    return { ...result, data: fixture };
  }

  async listLiveFixtures(season: SeasonRef): Promise<RawResponse<ProviderFixture[]>> {
    const result = await this.request(requests.liveFixtures(season));
    return { ...result, data: normalizeFixtures(result.raw) };
  }

  async listEvents(fixtureProviderId: string): Promise<RawResponse<ProviderEvent[]>> {
    const result = await this.request(requests.events(fixtureProviderId));
    return { ...result, data: normalizeEvents(result.raw, fixtureProviderId) };
  }

  async listStandings(season: SeasonRef): Promise<RawResponse<ProviderStanding[]>> {
    const result = await this.request(requests.standings(season));
    return { ...result, data: normalizeStandings(result.raw) };
  }

  async listTopScorers(season: SeasonRef): Promise<RawResponse<ProviderTopScorer[]>> {
    const result = await this.request(requests.topScorers(season));
    return { ...result, data: normalizeTopScorers(result.raw) };
  }
}

