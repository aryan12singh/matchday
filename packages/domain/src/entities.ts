import type {
  CompetitionId,
  FixtureId,
  LeagueId,
  LeagueSeasonId,
  PlayerId,
  PrizeSchemeId,
  RoundId,
  SeasonId,
  StageGroupId,
  StageId,
  TeamId,
  UserId,
} from './ids';

/**
 * Entity shapes mirroring the baseline schema (09-database-schema.md). These are the
 * types the app reasons in; the database row shapes are generated separately from
 * Supabase and mapped at the edge.
 */

// ---------------------------------------------------------------------------
// Competition hierarchy: Competition -> Season -> Stage -> Round -> Fixture
// ---------------------------------------------------------------------------

export const COMPETITION_KINDS = ['league', 'cup', 'hybrid', 'tournament'] as const;
export type CompetitionKind = (typeof COMPETITION_KINDS)[number];

export interface Competition {
  id: CompetitionId;
  code: string;
  name: string;
  kind: CompetitionKind;
  region: string | null;
  logoUrl: string | null;
}

export const SEASON_STATUSES = ['upcoming', 'active', 'completed'] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];

export interface Season {
  id: SeasonId;
  competitionId: CompetitionId;
  label: string;
  startDate: string | null;
  endDate: string | null;
  status: SeasonStatus;
  isCurrent: boolean;
  /**
   * Cached anchor for season-market locks. Addendum §H.5: the table predictor and Golden
   * Boot lock here, hard, with no grace window and no late entries.
   */
  firstKickoffAt: string | null;
}

export const STAGE_FORMATS = ['round_robin', 'groups', 'knockout'] as const;
export type StageFormat = (typeof STAGE_FORMATS)[number];

export interface Stage {
  id: StageId;
  seasonId: SeasonId;
  name: string;
  kind: StageFormat;
  sequence: number;
}

export interface StageGroup {
  id: StageGroupId;
  stageId: StageId;
  name: string;
}

export const ROUND_STATUSES = ['scheduled', 'open', 'live', 'completed'] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export interface Round {
  id: RoundId;
  stageId: StageId;
  number: number;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  status: RoundStatus;
}

export interface Team {
  id: TeamId;
  name: string;
  shortName: string | null;
  /** Three-letter code. The UI renders a neutral monogram chip from this — never a crest. */
  code: string | null;
  country: string | null;
  crestUrl: string | null;
}

export interface Player {
  id: PlayerId;
  fullName: string;
  knownAs: string | null;
  position: string | null;
  nationality: string | null;
  photoUrl: string | null;
}

/**
 * Full fixture state machine from the schema. The five states the design system renders
 * (editable / locked / live / settled / void) are derived from this plus market status —
 * see fixturePresentation() below.
 */
export const FIXTURE_STATUSES = [
  'scheduled',
  'lineups',
  'live',
  'ht',
  'finished',
  'settled',
  'postponed',
  'abandoned',
  'awarded',
  'cancelled',
] as const;
export type FixtureStatus = (typeof FIXTURE_STATUSES)[number];

export interface Fixture {
  id: FixtureId;
  roundId: RoundId;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  kickoffAt: string;
  status: FixtureStatus;
  minute: number | null;
  homeScore: number | null;
  awayScore: number | null;
  htHome: number | null;
  htAway: number | null;
  venue: string | null;
  resultConfirmedAt: string | null;
}

export const FIXTURE_EVENT_TYPES = [
  'goal',
  'own_goal',
  'penalty_goal',
  'missed_penalty',
  'yellow',
  'red',
  'substitution',
  'var',
] as const;
export type FixtureEventType = (typeof FIXTURE_EVENT_TYPES)[number];

export interface FixtureEvent {
  id: string;
  fixtureId: FixtureId;
  minute: number | null;
  addedMin: number | null;
  type: FixtureEventType;
  teamId: TeamId | null;
  playerId: PlayerId | null;
  assistPlayerId: PlayerId | null;
}

/** Goal-type events, in the order they count towards "first goal". */
export const GOAL_EVENT_TYPES = ['goal', 'own_goal', 'penalty_goal'] as const;
export type GoalEventType = (typeof GOAL_EVENT_TYPES)[number];

export const isGoalEvent = (event: Pick<FixtureEvent, 'type'>): boolean =>
  (GOAL_EVENT_TYPES as readonly string[]).includes(event.type);

// ---------------------------------------------------------------------------
// Presentation state — the five states every fixture-bearing screen must render.
// ---------------------------------------------------------------------------

export const FIXTURE_PRESENTATIONS = ['editable', 'locked', 'live', 'settled', 'void'] as const;
export type FixturePresentation = (typeof FIXTURE_PRESENTATIONS)[number];

/**
 * Maps the database fixture status onto the design system's five states.
 *
 * Deliberately keyed off `status` and the market lock rather than a clock comparison in
 * the component: the database is the authority on whether a prediction can still be
 * written (invariant 3), and the UI must never show "editable" for something the database
 * would reject.
 */
export function fixturePresentation(
  status: FixtureStatus,
  marketLocked: boolean,
): FixturePresentation {
  switch (status) {
    case 'live':
    case 'ht':
      return 'live';
    case 'finished':
      return 'settled';
    case 'settled':
      return 'settled';
    case 'postponed':
    case 'abandoned':
    case 'cancelled':
      return 'void';
    case 'awarded':
      // An awarded result is a real result: it settles, it does not void.
      return 'settled';
    case 'scheduled':
    case 'lineups':
      return marketLocked ? 'locked' : 'editable';
  }
}

// ---------------------------------------------------------------------------
// Leagues
// ---------------------------------------------------------------------------

export const LEAGUE_ROLES = ['organizer', 'member'] as const;
export type LeagueRole = (typeof LEAGUE_ROLES)[number];

export const REVEAL_POLICIES = ['at_kickoff', 'always', 'after_own_submission'] as const;
export type RevealPolicy = (typeof REVEAL_POLICIES)[number];

/** Addendum §B. */
export const SELECTION_MODES = ['all', 'admin_pick', 'vote'] as const;
export type SelectionMode = (typeof SELECTION_MODES)[number];

export const SELECTION_SOURCES = ['admin', 'vote', 'fallback'] as const;
export type SelectionSource = (typeof SELECTION_SOURCES)[number];

export interface League {
  id: LeagueId;
  name: string;
  createdBy: UserId | null;
  /** Only ever populated for an organizer, via the league_join_code() function. */
  joinCode?: string | null;
}

export interface LeagueSeason {
  id: LeagueSeasonId;
  leagueId: LeagueId;
  seasonId: SeasonId;
  revealPolicy: RevealPolicy;
  selectionMode: SelectionMode;
  /** Addendum §H.1: no fixed default. Null means "however many get finalized". */
  fixturesPerRound: number | null;
  /**
   * Null means this is a points-only league. design/README.md §6: when this is null the
   * app renders NO money UI anywhere — not a zeroed prize column, none of it.
   */
  prizeSchemeId: PrizeSchemeId | null;
  status: 'active' | 'completed' | 'archived';
}

/** The single gate for every money-bearing element in the UI. */
export const leagueHasPrizes = (league: Pick<LeagueSeason, 'prizeSchemeId'>): boolean =>
  league.prizeSchemeId != null;

export interface LeagueMember {
  leagueId: LeagueId;
  userId: UserId;
  role: LeagueRole;
  joinedAt: string;
}

export interface Profile {
  id: UserId;
  username: string;
  avatarUrl: string | null;
  timezone: string | null;
  isPlatformAdmin: boolean;
}
