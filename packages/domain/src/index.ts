/**
 * @matchday/domain — entity types + zod schemas for market values and outcomes.
 *
 * Filled in by Task 4. Scaffolded here so the workspace graph, import boundaries
 * and typecheck are wired from Task 1 onward.
 *
 * Boundary: this package imports nothing from the rest of the workspace. It is the
 * leaf every other package is allowed to depend on.
 */

/** Branded id helper — teams and players are entities (UUIDs), never text names. */
export type Id<Brand extends string> = string & { readonly __brand: Brand };

export type CompetitionId = Id<'Competition'>;
export type SeasonId = Id<'Season'>;
export type StageId = Id<'Stage'>;
export type RoundId = Id<'Round'>;
export type FixtureId = Id<'Fixture'>;
export type TeamId = Id<'Team'>;
export type PlayerId = Id<'Player'>;
export type MarketId = Id<'Market'>;
export type UserId = Id<'User'>;
export type LeagueId = Id<'League'>;
export type LeagueSeasonId = Id<'LeagueSeason'>;

/** Stage formats supported by the competition hierarchy (05-domain-model.md). */
export const STAGE_FORMATS = ['round_robin', 'groups', 'knockout'] as const;
export type StageFormat = (typeof STAGE_FORMATS)[number];

/** Fixture lifecycle as surfaced to the UI. Drives every fixture-card state. */
export const FIXTURE_STATES = ['scheduled', 'live', 'finished', 'postponed', 'void'] as const;
export type FixtureState = (typeof FIXTURE_STATES)[number];

/** League fixture-selection modes (addendum §B). */
export const SELECTION_MODES = ['all', 'admin_pick', 'vote'] as const;
export type SelectionMode = (typeof SELECTION_MODES)[number];

export const DOMAIN_PACKAGE = '@matchday/domain' as const;
