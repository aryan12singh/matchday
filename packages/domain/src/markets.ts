import { z } from 'zod';

import { playerIdSchema, teamIdSchema } from './ids';
import type { MarketId, PlayerId, TeamId } from './ids';

/**
 * Market values and outcomes — 05-domain-model.md §5.2, matching the answer_schema
 * seeded into market_types.
 *
 * A market is an instance of a market type attached to a fixture, round or season.
 * Predictions are global per (user, market): a user answers once, and every league they
 * belong to values that answer under its own weights (invariant 4).
 *
 * The hedge markets (goal_diff, total_goals, btts) accept null, meaning "derive it from
 * my scoreline". That is the old app's `pred_goal_diff ?? (ph - pa)` semantics, and it is
 * why they are separate markets rather than columns: a user who overrides goal difference
 * is making a different, independently scored claim.
 */

export const FIXTURE_MARKET_CODES = [
  'correct_score',
  'goal_diff',
  'total_goals',
  'btts',
  'first_scoring_team',
  'first_goalscorer',
] as const;
export type FixtureMarketCode = (typeof FIXTURE_MARKET_CODES)[number];

/** Addendum §C: standalone champion / top-4 / relegation picks were dropped. */
export const SEASON_MARKET_CODES = ['season_table', 'season_golden_boot'] as const;
export type SeasonMarketCode = (typeof SEASON_MARKET_CODES)[number];

export const MARKET_CODES = [...FIXTURE_MARKET_CODES, ...SEASON_MARKET_CODES] as const;
export type MarketCode = (typeof MARKET_CODES)[number];

export const MARKET_SCOPES = ['fixture', 'round', 'season'] as const;
export type MarketScope = (typeof MARKET_SCOPES)[number];

export const MARKET_STATUSES = ['open', 'locked', 'settled', 'void'] as const;
export type MarketStatus = (typeof MARKET_STATUSES)[number];

export interface Market {
  id: MarketId;
  code: MarketCode;
  scope: MarketScope;
  status: MarketStatus;
  /** Hard lock. Fixture markets use the fixture's kickoff; season markets the season's. */
  locksAt: string;
  settledAt: string | null;
}

/** A market is writable only while open AND before its lock. Mirrors the DB trigger. */
export const isMarketWritable = (market: Pick<Market, 'status' | 'locksAt'>, now = new Date()) =>
  market.status === 'open' && new Date(market.locksAt) > now;

// ---------------------------------------------------------------------------
// Prediction values
// ---------------------------------------------------------------------------

/** A scoreline. Bounded so a stepper cannot submit an absurd value. */
const goalCount = z.number().int().min(0).max(99);

export const correctScoreValueSchema = z.object({
  home: goalCount,
  away: goalCount,
});
export type CorrectScoreValue = z.infer<typeof correctScoreValueSchema>;

export const goalDiffValueSchema = z.object({
  /** null = derive from the scoreline. */
  value: z.number().int().min(-99).max(99).nullable().default(null),
});
export type GoalDiffValue = z.infer<typeof goalDiffValueSchema>;

export const totalGoalsValueSchema = z.object({
  value: goalCount.nullable().default(null),
});
export type TotalGoalsValue = z.infer<typeof totalGoalsValueSchema>;

export const bttsValueSchema = z.object({
  value: z.boolean().nullable().default(null),
});
export type BttsValue = z.infer<typeof bttsValueSchema>;

/**
 * "No first goal" is a real, scoreable answer, correct only in a goalless match. The old
 * app used a 'NONE' string sentinel; here it is an explicit boolean beside a nullable id,
 * so an unanswered market and a deliberate "no goals" answer cannot be confused.
 */
export const firstScoringTeamValueSchema = z
  .object({
    teamId: teamIdSchema.nullable().default(null),
    none: z.boolean().default(false),
  })
  .refine((v) => !(v.none && v.teamId != null), {
    message: 'first_scoring_team cannot be both a team and "no goals"',
  });
export type FirstScoringTeamValue = z.infer<typeof firstScoringTeamValueSchema>;

export const firstGoalscorerValueSchema = z
  .object({
    playerId: playerIdSchema.nullable().default(null),
    none: z.boolean().default(false),
  })
  .refine((v) => !(v.none && v.playerId != null), {
    message: 'first_goalscorer cannot be both a player and "no scorer"',
  });
export type FirstGoalscorerValue = z.infer<typeof firstGoalscorerValueSchema>;

export const SEASON_TABLE_TEAM_COUNT = 20;

/**
 * The season table predictor: an ordered list of all 20 team ids, position 1 first.
 * Duplicates are rejected — a table with a team in two places is not a table.
 */
export const seasonTableValueSchema = z.object({
  order: z
    .array(teamIdSchema)
    .length(SEASON_TABLE_TEAM_COUNT)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'the predicted table must list each team exactly once',
    }),
});
export type SeasonTableValue = z.infer<typeof seasonTableValueSchema>;

export const goldenBootValueSchema = z.object({
  playerId: playerIdSchema,
});
export type GoldenBootValue = z.infer<typeof goldenBootValueSchema>;

/** Every prediction value, discriminated by its market code. */
export const marketValueSchemas = {
  correct_score: correctScoreValueSchema,
  goal_diff: goalDiffValueSchema,
  total_goals: totalGoalsValueSchema,
  btts: bttsValueSchema,
  first_scoring_team: firstScoringTeamValueSchema,
  first_goalscorer: firstGoalscorerValueSchema,
  season_table: seasonTableValueSchema,
  season_golden_boot: goldenBootValueSchema,
} as const satisfies Record<MarketCode, z.ZodTypeAny>;

export type MarketValue<Code extends MarketCode = MarketCode> = z.infer<
  (typeof marketValueSchemas)[Code]
>;

/** Parses an untrusted jsonb value for a known market code. Throws on invalid input. */
export function parseMarketValue<Code extends MarketCode>(
  code: Code,
  value: unknown,
): MarketValue<Code> {
  return marketValueSchemas[code].parse(value) as MarketValue<Code>;
}

// ---------------------------------------------------------------------------
// Composite fixture prediction — what the predict screen saves in one action.
//
// The user fills in one card; the API fans it out to one prediction row per market
// (05-domain-model.md §5.2: "the market granularity exists for scoring and analytics, not
// for making users file seven separate submissions").
// ---------------------------------------------------------------------------

export const fixturePredictionSchema = z.object({
  score: correctScoreValueSchema,
  goalDiff: goalDiffValueSchema.shape.value,
  totalGoals: totalGoalsValueSchema.shape.value,
  btts: bttsValueSchema.shape.value,
  firstScoringTeam: firstScoringTeamValueSchema,
  firstGoalscorer: firstGoalscorerValueSchema,
});
export type FixturePrediction = z.infer<typeof fixturePredictionSchema>;

/** Fills the hedge markets from the scoreline exactly as the settlers will read them. */
export function derivedHedges(score: CorrectScoreValue) {
  return {
    goalDiff: score.home - score.away,
    totalGoals: score.home + score.away,
    btts: score.home > 0 && score.away > 0,
  };
}

// ---------------------------------------------------------------------------
// Market outcomes — written onto the market at settlement.
// ---------------------------------------------------------------------------

export const fixtureOutcomeSchema = z.object({
  homeScore: goalCount,
  awayScore: goalCount,
  /** null when the fixture finished goalless; the settlers treat that as "none". */
  firstScoringTeamId: teamIdSchema.nullable(),
  firstGoalscorerId: playerIdSchema.nullable(),
  /**
   * Player ids considered equivalent to the first scorer (provider duplicate merges,
   * ported from lib/player-equivalence.ts). A prediction naming any of these is correct.
   */
  equivalentScorerIds: z.array(playerIdSchema).default([]),
  /** True when the opening goal was an own goal, which no first-scorer pick can hit. */
  firstGoalWasOwnGoal: z.boolean().default(false),
});
export type FixtureOutcome = z.infer<typeof fixtureOutcomeSchema>;

export const seasonTableOutcomeSchema = z.object({
  /** Actual final (or current, for live tracking) table order, position 1 first. */
  order: z.array(teamIdSchema).length(SEASON_TABLE_TEAM_COUNT),
});
export type SeasonTableOutcome = z.infer<typeof seasonTableOutcomeSchema>;

export const goldenBootOutcomeSchema = z.object({
  /** More than one id when the Golden Boot is shared. */
  playerIds: z.array(playerIdSchema).min(1),
  goals: z.number().int().min(0),
});
export type GoldenBootOutcome = z.infer<typeof goldenBootOutcomeSchema>;

export type { MarketId, PlayerId, TeamId };
