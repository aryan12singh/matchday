/**
 * ProviderAdapter — the seam between MatchDay and whichever football data provider we
 * are paying (07-provider-comparison.md).
 *
 * Everything above this interface speaks in provider-neutral shapes. That is what makes
 * the Sportmonks fallback in addendum §F a real option rather than a hopeful sentence:
 * swapping providers means writing one more adapter, not touching the jobs, the schema or
 * a single screen.
 *
 * The interface returns *raw* provider payloads alongside normalised entities on purpose.
 * Invariant 1 requires every response to be archived to raw_payloads before it is
 * interpreted, so a normalizer bug can be fixed and replayed against the original bytes
 * rather than needing the provider to be asked again — which, on a prepaid quota, may not
 * be possible at all.
 */

export interface RawResponse<T> {
  /** Exactly what the provider returned, for the raw_payloads archive. */
  raw: unknown;
  /** Normalised, provider-neutral view of the same thing. */
  data: T;
  endpoint: string;
  paramsHash: string;
  httpStatus: number;
}

export interface ProviderTeam {
  providerId: string;
  name: string;
  shortName: string | null;
  code: string | null;
  country: string | null;
  crestUrl: string | null;
}

export interface ProviderPlayer {
  providerId: string;
  fullName: string;
  knownAs: string | null;
  position: string | null;
  nationality: string | null;
  photoUrl: string | null;
  shirtNumber: number | null;
  teamProviderId: string;
}

export type ProviderFixtureStatus =
  | 'scheduled'
  | 'lineups'
  | 'live'
  | 'ht'
  | 'finished'
  | 'postponed'
  | 'abandoned'
  | 'cancelled'
  | 'awarded';

export interface ProviderFixture {
  providerId: string;
  roundLabel: string;
  roundNumber: number | null;
  kickoffAt: string;
  status: ProviderFixtureStatus;
  minute: number | null;
  homeTeamProviderId: string;
  awayTeamProviderId: string;
  /**
   * Club names as this provider spells them. Present so a fixture can be matched to one
   * already loaded from a different source, which is the only way to link the schedule
   * (Premier League JSON) to live results (API-Football) — their ids share nothing.
   */
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  homeScore: number | null;
  awayScore: number | null;
  htHome: number | null;
  htAway: number | null;
  venue: string | null;
}

export type ProviderEventType =
  | 'goal'
  | 'own_goal'
  | 'penalty_goal'
  | 'missed_penalty'
  | 'yellow'
  | 'red'
  | 'substitution'
  | 'var';

export interface ProviderEvent {
  /** Stable per (fixture, event) so re-ingesting cannot duplicate. */
  providerEventKey: string;
  fixtureProviderId: string;
  type: ProviderEventType;
  minute: number | null;
  addedMinute: number | null;
  teamProviderId: string | null;
  playerProviderId: string | null;
  assistPlayerProviderId: string | null;
}

export interface ProviderStanding {
  teamProviderId: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: string | null;
}

export interface ProviderTopScorer {
  playerProviderId: string;
  teamProviderId: string | null;
  goals: number;
}

export interface ProviderAdapter {
  readonly name: string;

  listTeams(seasonRef: SeasonRef): Promise<RawResponse<ProviderTeam[]>>;
  listSquad(seasonRef: SeasonRef, teamProviderId: string): Promise<RawResponse<ProviderPlayer[]>>;
  listFixtures(seasonRef: SeasonRef): Promise<RawResponse<ProviderFixture[]>>;
  getFixture(fixtureProviderId: string): Promise<RawResponse<ProviderFixture>>;
  listLiveFixtures(seasonRef: SeasonRef): Promise<RawResponse<ProviderFixture[]>>;
  listEvents(fixtureProviderId: string): Promise<RawResponse<ProviderEvent[]>>;
  listStandings(seasonRef: SeasonRef): Promise<RawResponse<ProviderStanding[]>>;
  listTopScorers(seasonRef: SeasonRef): Promise<RawResponse<ProviderTopScorer[]>>;
}

/**
 * The subset a season bootstrap needs.
 *
 * Split out because not every source can answer everything: the Premier League's own JSON
 * has the schedule and squads but no usable event stream, while API-Football's free tier
 * has live events but not the schedule. Naming the smaller contract lets a partial source
 * be used honestly, instead of implementing the full adapter and throwing from two thirds
 * of it.
 */
export type ScheduleProvider = Pick<
  ProviderAdapter,
  'name' | 'listTeams' | 'listSquad' | 'listFixtures'
>;

/** Which competition-season to ask about, in the provider's own terms. */
export interface SeasonRef {
  leagueProviderId: string;
  /** API-Football uses the starting year, e.g. 2026 for 2026/27. */
  seasonYear: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  /**
   * 429 and 5xx are worth retrying; 4xx are not — a bad request or an exhausted prepaid
   * plan will fail identically on every attempt, and retrying burns quota we cannot spare.
   */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}
