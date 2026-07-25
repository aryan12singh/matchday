/**
 * @matchday/scoring — pure settlers, aggregation and tiebreaks.
 *
 * Ported from ../wc26-predictor/lib/scoring.ts in Task 5.
 *
 * Boundary (lint- and repo-check-enforced): this package may import ONLY
 * @matchday/domain. Zero IO — no fs, no net, no database, no clock reads passed
 * implicitly. Every settler is a pure function of its arguments so the golden
 * vectors stay reproducible and score runs stay re-runnable.
 */

import { DOMAIN_PACKAGE } from '@matchday/domain';

/** Proves the domain boundary resolves; replaced by real settlers in Task 5. */
export const SCORING_DEPENDS_ON = DOMAIN_PACKAGE;

export const SCORING_PACKAGE = '@matchday/scoring' as const;
