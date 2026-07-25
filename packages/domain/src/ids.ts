import { z } from 'zod';

/**
 * Branded ids. Invariant 2: teams and players are entities, never text names — the brands
 * make it a type error to pass a team name (or a player id) where a team id belongs.
 *
 * Provider ids never appear in this file, or anywhere outside packages/provider. Invariant
 * 1: application code addresses entities by internal uuid, resolved through
 * provider_entity_map at ingestion time.
 */
export type Id<Brand extends string> = string & { readonly __brand: Brand };

export type CompetitionId = Id<'Competition'>;
export type SeasonId = Id<'Season'>;
export type StageId = Id<'Stage'>;
export type StageGroupId = Id<'StageGroup'>;
export type RoundId = Id<'Round'>;
export type FixtureId = Id<'Fixture'>;
export type TeamId = Id<'Team'>;
export type PlayerId = Id<'Player'>;
export type MarketId = Id<'Market'>;
export type MarketTypeId = Id<'MarketType'>;
export type UserId = Id<'User'>;
export type LeagueId = Id<'League'>;
export type LeagueSeasonId = Id<'LeagueSeason'>;
export type RuleSetId = Id<'RuleSet'>;
export type RuleSetVersionId = Id<'RuleSetVersion'>;
export type ScoreRunId = Id<'ScoreRun'>;
export type PrizeSchemeId = Id<'PrizeScheme'>;

/** Parses a uuid and brands it. Use at every trust boundary (route input, DB row). */
export const idSchema = <Brand extends string>() =>
  z.string().uuid().transform((value) => value as Id<Brand>);

export const teamIdSchema = idSchema<'Team'>();
export const playerIdSchema = idSchema<'Player'>();
export const fixtureIdSchema = idSchema<'Fixture'>();
export const marketIdSchema = idSchema<'Market'>();
export const roundIdSchema = idSchema<'Round'>();
export const seasonIdSchema = idSchema<'Season'>();
export const leagueIdSchema = idSchema<'League'>();
export const leagueSeasonIdSchema = idSchema<'LeagueSeason'>();
export const userIdSchema = idSchema<'User'>();
