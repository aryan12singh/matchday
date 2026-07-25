import { z } from 'zod';

/**
 * Scoring vocabulary — 06-scoring-leaderboards-prizes.md.
 *
 * Two-phase model (invariant 4):
 *   Phase 1, settlement: compute category *hits* once, globally, league-independent.
 *   Phase 2, valuation:  a league's bound rule-set version supplies the weights.
 *
 * The constraint that makes weight-swapping sound is that every phase-1 category is
 * all-or-nothing. A market that ever needs graded points gets its own category with its
 * own hit condition — never a fractional hit.
 */

/**
 * The eight categories the ported engine produces. Seven carry non-zero default weight;
 * `team_goals` is settled but weighted 0 in v1, matching the old app's DEFAULT_WEIGHTS,
 * so a league can switch it on later with no re-settlement.
 */
export const SCORE_CATEGORIES = [
  'outcome',
  'exact',
  'goal_diff',
  'total_goals',
  'team_goals',
  'btts',
  'first_team',
  'first_scorer',
] as const;
export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

/** One settled category for one user on one market. Never an opaque total. */
export interface ScoreComponent {
  category: ScoreCategory;
  hit: boolean;
  /** Display detail — e.g. the actual first scorer, so the UI can explain a miss. */
  raw?: Record<string, unknown> | null;
}

export const categoryWeightSchema = z.object({
  enabled: z.boolean(),
  weight: z.number(),
  label: z.string().optional(),
});

/**
 * Tiebreak chain, copied from compareLeaderboard() in
 * ../wc26-predictor/lib/leaderboard.ts. Accuracy decides everything first; `submissions`
 * is last, so entering more fixtures only helps once every accuracy category is level.
 */
export const TIEBREAK_KEYS = [
  'points',
  ...SCORE_CATEGORIES,
  'submissions',
] as const;
export type TiebreakKey = (typeof TIEBREAK_KEYS)[number];

export const ruleSetDefinitionSchema = z.object({
  // partialRecord, not record: zod 4 makes an enum-keyed record exhaustive, and a rule set
  // must be allowed to omit categories it does not use. An absent category means disabled,
  // which resolveWeights() below turns into weight 0 — so adding a ninth category later
  // cannot retroactively invalidate every stored v1 definition.
  categories: z.partialRecord(z.enum(SCORE_CATEGORIES), categoryWeightSchema),
  params: z
    .object({
      /** Consolation only when the exact scoreline was missed (old-app parity). */
      team_goals_only_when_exact_missed: z.boolean().default(true),
      /** Own goals never count as the "first scorer" (05-domain-model.md §5.2). */
      first_scorer_excludes_own_goals: z.boolean().default(true),
    })
    .default({
      team_goals_only_when_exact_missed: true,
      first_scorer_excludes_own_goals: true,
    }),
  tiebreaks: z.array(z.enum(TIEBREAK_KEYS)),
});
export type RuleSetDefinition = z.infer<typeof ruleSetDefinitionSchema>;

export type CategoryWeights = Record<ScoreCategory, number>;

/** Resolves a rule-set definition to a plain weight lookup, with disabled categories at 0. */
export function resolveWeights(definition: RuleSetDefinition): CategoryWeights {
  const weights = {} as CategoryWeights;
  for (const category of SCORE_CATEGORIES) {
    const entry = definition.categories[category];
    weights[category] = entry && entry.enabled ? entry.weight : 0;
  }
  return weights;
}

/**
 * The seeded v1 weights, mirroring supabase/seed/seed.sql. Kept here so pure code and
 * tests have a default without a database round trip — the database remains the source
 * of truth for what a given league is actually bound to.
 */
export const DEFAULT_WEIGHTS: CategoryWeights = {
  outcome: 3,
  exact: 3,
  goal_diff: 2,
  total_goals: 1,
  team_goals: 0,
  btts: 1,
  first_team: 2,
  first_scorer: 4,
};

// ---------------------------------------------------------------------------
// Season table predictor — a separate competition (invariant 8).
// ---------------------------------------------------------------------------

/**
 * Addendum §C. Score = Σ|predicted − actual| position; **lowest wins**. Never merged into
 * weekly or overall points; it has its own board ("Table race") and its own prize line.
 */
export interface SeasonTableScore {
  /** Σ|diff| — the score itself. Lower is better. */
  totalAbs: number;
  /** Σdiff² — first tiebreak; punishes one big miss more than several small ones. */
  totalSq: number;
  exactHits: number;
  championHit: boolean;
  top4Hits: number;
  relegationHits: number;
  biggestMiss: { teamId: string; diff: number } | null;
  perTeam: Array<{ teamId: string; predicted: number; actual: number; diff: number }>;
}
