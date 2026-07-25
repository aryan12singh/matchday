import {
  type CategoryWeights,
  type FixtureOutcome,
  type FixturePrediction,
  type ScoreCategory,
  type ScoreComponent,
  SCORE_CATEGORIES,
  derivedHedges,
} from '@matchday/domain';

/**
 * Fixture settlement — ported from ../wc26-predictor/lib/scoring.ts.
 *
 * The semantics are unchanged; the shape is not. The old engine returned points
 * (`{outcome: 3, exact: 3, ...}`). This one returns all-or-nothing **hits**, because
 * points are a league-level concept now (invariant 4): hits are settled once, globally,
 * and each league values them through its own bound rule-set version. That is what lets a
 * league change its weights mid-season without re-settling a single fixture.
 *
 * Purity is enforced, not merely intended: this package may import only @matchday/domain,
 * checked by both eslint and scripts/repo-check.ts. No clock, no randomness, no IO —
 * a score run must produce identical output every time it is re-run over the same inputs.
 */

const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

export interface SettlementParams {
  /** Consolation only when the exact scoreline was missed (old-app parity). */
  teamGoalsOnlyWhenExactMissed: boolean;
  /** Own goals never satisfy a first-scorer pick (05-domain-model.md §5.2). */
  firstScorerExcludesOwnGoals: boolean;
}

export const DEFAULT_SETTLEMENT_PARAMS: SettlementParams = {
  teamGoalsOnlyWhenExactMissed: true,
  firstScorerExcludesOwnGoals: true,
};

/**
 * Settles one user's composite fixture prediction into its category hits.
 *
 * Returns a component for every category — including the misses. A missing row and a
 * `hit: false` row mean different things: the first says "not settled", the second says
 * "settled, wrong", and the leaderboard's accuracy figures depend on telling them apart.
 */
export function settleFixture(
  prediction: FixturePrediction,
  outcome: FixtureOutcome,
  params: SettlementParams = DEFAULT_SETTLEMENT_PARAMS,
): ScoreComponent[] {
  const { homeScore: rh, awayScore: ra } = outcome;
  const ph = prediction.score.home;
  const pa = prediction.score.away;

  // A null hedge means "derive it from my scoreline" — the old `?? (ph - pa)` semantics.
  const derived = derivedHedges(prediction.score);
  const predGoalDiff = prediction.goalDiff ?? derived.goalDiff;
  const predTotalGoals = prediction.totalGoals ?? derived.totalGoals;
  const predBtts = prediction.btts ?? derived.btts;

  const exactHit = ph === rh && pa === ra;
  const oneTeamExact = ph === rh || pa === ra;

  const components: ScoreComponent[] = [
    {
      category: 'outcome',
      hit: sign(ph - pa) === sign(rh - ra),
      raw: { predicted: sign(ph - pa), actual: sign(rh - ra) },
    },
    {
      category: 'exact',
      hit: exactHit,
      raw: { predicted: `${ph}-${pa}`, actual: `${rh}-${ra}` },
    },
    {
      category: 'goal_diff',
      hit: predGoalDiff === rh - ra,
      raw: { predicted: predGoalDiff, actual: rh - ra, hedged: prediction.goalDiff != null },
    },
    {
      category: 'total_goals',
      hit: predTotalGoals === rh + ra,
      raw: { predicted: predTotalGoals, actual: rh + ra, hedged: prediction.totalGoals != null },
    },
    {
      // Consolation for nailing one team's goals, awarded only when the exact scoreline
      // was missed — otherwise it would stack on top of `exact` and double-pay.
      category: 'team_goals',
      hit: params.teamGoalsOnlyWhenExactMissed ? !exactHit && oneTeamExact : oneTeamExact,
      raw: { home: ph === rh, away: pa === ra },
    },
    {
      category: 'btts',
      hit: predBtts === (rh > 0 && ra > 0),
      raw: { predicted: predBtts, actual: rh > 0 && ra > 0, hedged: prediction.btts != null },
    },
    settleFirstScoringTeam(prediction, outcome),
    settleFirstGoalscorer(prediction, outcome, params),
  ];

  return components;
}

function settleFirstScoringTeam(
  prediction: FixturePrediction,
  outcome: FixtureOutcome,
): ScoreComponent {
  const goalless = outcome.homeScore === 0 && outcome.awayScore === 0;
  const answer = prediction.firstScoringTeam;

  // "No goals" is a real answer, correct in exactly one match: a goalless one.
  if (answer.none) {
    return {
      category: 'first_team',
      hit: goalless,
      raw: { predicted: 'none', actual: goalless ? 'none' : outcome.firstScoringTeamId },
    };
  }

  return {
    category: 'first_team',
    hit: answer.teamId != null && answer.teamId === outcome.firstScoringTeamId,
    raw: { predicted: answer.teamId, actual: outcome.firstScoringTeamId },
  };
}

function settleFirstGoalscorer(
  prediction: FixturePrediction,
  outcome: FixtureOutcome,
  params: SettlementParams,
): ScoreComponent {
  const answer = prediction.firstGoalscorer;
  const goalless = outcome.homeScore === 0 && outcome.awayScore === 0;

  if (answer.none) {
    return {
      category: 'first_scorer',
      hit: goalless,
      raw: { predicted: 'none', actual: goalless ? 'none' : outcome.firstGoalscorerId },
    };
  }

  if (answer.playerId == null) {
    return { category: 'first_scorer', hit: false, raw: { predicted: null } };
  }

  // An own goal opens the scoring for the other team; nobody's first-scorer pick can be
  // correct. The old app had no own-goal case at all — this is a new vector, not a port.
  if (params.firstScorerExcludesOwnGoals && outcome.firstGoalWasOwnGoal) {
    return {
      category: 'first_scorer',
      hit: false,
      raw: { predicted: answer.playerId, actual: 'own_goal' },
    };
  }

  if (outcome.firstGoalscorerId == null) {
    return {
      category: 'first_scorer',
      hit: false,
      raw: { predicted: answer.playerId, actual: null },
    };
  }

  // Provider duplicate merges: a prediction naming any equivalent id is correct
  // (ported from lib/player-equivalence.ts).
  const acceptable = new Set<string>([outcome.firstGoalscorerId, ...outcome.equivalentScorerIds]);

  return {
    category: 'first_scorer',
    hit: acceptable.has(answer.playerId),
    raw: { predicted: answer.playerId, actual: outcome.firstGoalscorerId },
  };
}

/**
 * A voided fixture settles to zero for everyone, and does so explicitly.
 *
 * The alternative — leaving the markets unsettled — reads identically on a leaderboard
 * but leaves the round permanently "in progress", so nothing downstream (prizes, rank
 * snapshots, the recap) can ever complete. 05-domain-model.md §5.2 makes this the default
 * policy for abandoned and cancelled fixtures.
 */
export function settleVoidFixture(): ScoreComponent[] {
  return SCORE_CATEGORIES.map((category) => ({
    category,
    hit: false,
    raw: { void: true },
  }));
}

/** Phase 2: value a settled set of components under one league's weights. */
export function valueComponents(
  components: readonly ScoreComponent[],
  weights: CategoryWeights,
): number {
  return components.reduce(
    (total, component) => total + (component.hit ? (weights[component.category] ?? 0) : 0),
    0,
  );
}

/**
 * Provisional points for a live fixture: the same settlers applied to the current score
 * as if it were final. Never written to score_components — only finished fixtures settle
 * (06-scoring-leaderboards-prizes.md §6.3) — and the UI must always label it provisional.
 */
export function provisionalPoints(
  prediction: FixturePrediction,
  liveOutcome: FixtureOutcome,
  weights: CategoryWeights,
  params: SettlementParams = DEFAULT_SETTLEMENT_PARAMS,
): number {
  return valueComponents(settleFixture(prediction, liveOutcome, params), weights);
}

export type { ScoreCategory };
