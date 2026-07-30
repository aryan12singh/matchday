/**
 * @matchday/scoring — pure settlers, aggregation and tiebreaks.
 *
 * Ported from ../wc26-predictor/lib/scoring.ts and lib/leaderboard.ts. Semantics are
 * preserved; the shape changed from points to all-or-nothing hits so that a league's
 * weights apply at aggregation rather than at settlement (invariant 4).
 *
 * This package may import ONLY @matchday/domain, and performs zero IO — enforced by
 * eslint.config.mjs and, with an allowlist, by scripts/repo-check.ts. Every function here
 * is a pure function of its arguments so score runs are re-runnable and idempotent
 * (invariant 5) and the golden vectors stay meaningful.
 */

export * from './settlers';
export * from './season-table';
export * from './leaderboard';
export * from './prizes';

export const SCORING_PACKAGE = '@matchday/scoring' as const;
