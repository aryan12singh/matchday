import {
  type ProviderFixture,
  type ProviderFixtureStatus,
  type ProviderPlayer,
  type ProviderTeam,
  type RawResponse,
  type ScheduleProvider,
  type SeasonRef,
  ProviderError,
} from './adapter';

/**
 * Fantasy Premier League as a schedule provider.
 *
 * API-Football's free plan restricts the `season` parameter, which makes the one thing the
 * app is built on — the 38-matchweek fixture list — unobtainable without a paid plan.
 * Squads and live data are reachable, the schedule is not.
 *
 * The Premier League publishes all of it themselves, unauthenticated, as JSON:
 *
 *   /api/bootstrap-static/   20 teams, ~560 players with club and position, 38 gameweeks
 *   /api/fixtures/           380 fixtures with kickoff times and gameweek numbers
 *
 * This is not scraping. It is the JSON API behind the PL's own fantasy game, and it is
 * requested and parsed as data rather than lifted out of rendered HTML.
 *
 * What it is NOT: documented, versioned, or promised. It can change shape without notice,
 * which is why every response is archived to raw_payloads like any other provider, why the
 * normalizers are pinned by cassettes, and why this implements the narrow ScheduleProvider
 * interface rather than the full adapter. It has no usable event stream, so first-goalscorer
 * and live minutes still come from API-Football — trying to serve those from here would be
 * the failure mode this interface exists to prevent.
 */

const BASE = 'https://fantasy.premierleague.com/api';

/** The PL's public asset host, addressed by the codes the API itself returns. */
const crestUrl = (code: number) =>
  `https://resources.premierleague.com/premierleague/badges/70/t${code}.png`;
const photoUrl = (photo: string) =>
  `https://resources.premierleague.com/premierleague/photos/players/110x140/p${photo.replace(/\.jpg$/, '')}.png`;

interface FplTeam {
  id: number;
  code: number;
  name: string;
  short_name: string;
}

interface FplElement {
  id: number;
  code: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  element_type: number;
  squad_number: number | null;
  photo: string;
}

interface FplElementType {
  id: number;
  singular_name: string;
}

interface FplBootstrap {
  teams: FplTeam[];
  elements: FplElement[];
  element_types: FplElementType[];
}

interface FplFixture {
  id: number;
  event: number | null;
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  started: boolean | null;
  finished: boolean;
  minutes: number;
}

export interface FplOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  onRequest?: (endpoint: string) => void | Promise<void>;
}

export class FplAdapter implements ScheduleProvider {
  readonly name = 'fpl';

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  /** bootstrap-static is one large response that answers both teams and squads. */
  private bootstrapCache: { raw: unknown; data: FplBootstrap } | null = null;

  constructor(private readonly options: FplOptions = {}) {
    this.baseUrl = options.baseUrl ?? BASE;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(endpoint: string): Promise<{ raw: unknown; endpoint: string }> {
    await this.options.onRequest?.(endpoint);

    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      // The endpoint 403s a bare programmatic client.
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MatchDay/1.0)' },
    });

    if (!response.ok) {
      throw new ProviderError(`FPL ${endpoint} returned ${response.status}`, response.status, endpoint);
    }

    return { raw: await response.json(), endpoint };
  }

  private async bootstrap(): Promise<{ raw: unknown; data: FplBootstrap }> {
    if (this.bootstrapCache) return this.bootstrapCache;

    const { raw } = await this.request('/bootstrap-static/');
    const data = raw as FplBootstrap;

    if (!Array.isArray(data?.teams) || !Array.isArray(data?.elements)) {
      throw new ProviderError('FPL bootstrap-static had an unexpected shape', 502, '/bootstrap-static/');
    }

    this.bootstrapCache = { raw, data };
    return this.bootstrapCache;
  }

  async listTeams(_season: SeasonRef): Promise<RawResponse<ProviderTeam[]>> {
    const { raw, data } = await this.bootstrap();
    return {
      raw,
      endpoint: '/bootstrap-static/',
      paramsHash: 'teams',
      httpStatus: 200,
      data: normalizeFplTeams(data),
    };
  }

  async listSquad(_season: SeasonRef, teamProviderId: string): Promise<RawResponse<ProviderPlayer[]>> {
    const { raw, data } = await this.bootstrap();
    return {
      raw,
      endpoint: '/bootstrap-static/',
      paramsHash: `squad-${teamProviderId}`,
      httpStatus: 200,
      data: normalizeFplSquad(data, teamProviderId),
    };
  }

  async listFixtures(_season: SeasonRef): Promise<RawResponse<ProviderFixture[]>> {
    const { raw } = await this.request('/fixtures/');
    return {
      raw,
      endpoint: '/fixtures/',
      paramsHash: 'all',
      httpStatus: 200,
      data: normalizeFplFixtures(raw),
    };
  }
}

// ---------------------------------------------------------------------------
// Normalizers. Pure, so cassettes can pin them without a network.
// ---------------------------------------------------------------------------

export function normalizeFplTeams(bootstrap: FplBootstrap): ProviderTeam[] {
  return bootstrap.teams.map((team) => ({
    providerId: String(team.id),
    name: team.name,
    shortName: team.short_name,
    code: team.short_name,
    country: 'England',
    crestUrl: crestUrl(team.code),
  }));
}

export function normalizeFplSquad(
  bootstrap: FplBootstrap,
  teamProviderId: string,
): ProviderPlayer[] {
  const positions = new Map(bootstrap.element_types.map((t) => [t.id, t.singular_name]));

  return bootstrap.elements
    .filter((player) => String(player.team) === teamProviderId)
    .map((player) => ({
      providerId: String(player.id),
      // Both names, because two players at one club can share a surname and the picker
      // has to be searchable by either.
      fullName: `${player.first_name} ${player.second_name}`.trim(),
      knownAs: player.web_name,
      position: positions.get(player.element_type) ?? null,
      nationality: null,
      photoUrl: player.photo ? photoUrl(player.photo) : null,
      shirtNumber: player.squad_number,
      teamProviderId,
    }));
}

export function normalizeFplFixtures(payload: unknown): ProviderFixture[] {
  const fixtures = Array.isArray(payload) ? (payload as FplFixture[]) : [];

  return fixtures
    // A fixture with no gameweek or no kickoff is genuinely undated — a postponement not
    // yet rearranged. Including it would create a market with no deadline, which the lock
    // trigger has no way to enforce.
    .filter((f) => f.event != null && f.kickoff_time != null)
    .map((fixture) => ({
      providerId: String(fixture.id),
      roundLabel: `Gameweek ${fixture.event}`,
      roundNumber: fixture.event,
      kickoffAt: new Date(fixture.kickoff_time!).toISOString(),
      status: fplStatus(fixture),
      minute: fixture.started && !fixture.finished ? (fixture.minutes ?? null) : null,
      homeTeamProviderId: String(fixture.team_h),
      awayTeamProviderId: String(fixture.team_a),
      homeScore: fixture.team_h_score,
      awayScore: fixture.team_a_score,
      htHome: null,
      htAway: null,
      venue: null,
    }));
}

/**
 * FPL states a fixture with two booleans rather than a status code.
 *
 * `finished` flips only once the gameweek's points are confirmed, which lags the final
 * whistle — so this is deliberately never used to drive settlement. Settlement runs from
 * API-Football's status, and this exists so the schedule sync knows what it is looking at.
 */
function fplStatus(fixture: FplFixture): ProviderFixtureStatus {
  if (fixture.finished) return 'finished';
  if (fixture.started) return 'live';
  return 'scheduled';
}
