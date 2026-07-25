import type { FixtureOutcome, FixturePrediction, ScoreCategory } from '@matchday/domain';
import { DEFAULT_WEIGHTS } from '@matchday/domain';
import { describe, expect, it } from 'vitest';

import { settleFixture, settleVoidFixture, valueComponents } from './settlers';

/**
 * Golden vectors.
 *
 * Every case from ../wc26-predictor/lib/scoring.test.ts is carried over verbatim in
 * meaning — the assertions moved from "this category scored N points" to "this category
 * hit", which is the same claim under the two-phase model. The own-goal and void cases at
 * the end are new (task 5 asks for them); the old engine had no concept of either.
 */

const PLAYER_A = '00000000-0000-4000-8000-00000000000a';
const PLAYER_B = '00000000-0000-4000-8000-00000000000b';
const HOME = '00000000-0000-4000-8000-0000000000a1';
const AWAY = '00000000-0000-4000-8000-0000000000a2';

const prediction = (over: Partial<FixturePrediction> = {}): FixturePrediction => ({
  score: { home: 2, away: 1 },
  goalDiff: null,
  totalGoals: null,
  btts: null,
  firstScoringTeam: { teamId: null, none: false },
  firstGoalscorer: { playerId: null, none: false },
  ...over,
});

const outcome = (home: number, away: number, over: Partial<FixtureOutcome> = {}): FixtureOutcome => ({
  homeScore: home,
  awayScore: away,
  firstScoringTeamId: null,
  firstGoalscorerId: null,
  equivalentScorerIds: [],
  firstGoalWasOwnGoal: false,
  ...over,
});

const hits = (components: ReturnType<typeof settleFixture>): Set<ScoreCategory> =>
  new Set(components.filter((c) => c.hit).map((c) => c.category));

describe('settleFixture — ported vectors', () => {
  it('a perfect call hits outcome, exact, goal diff and total goals — team_goals does not stack', () => {
    const got = hits(settleFixture(prediction(), outcome(2, 1)));
    expect(got.has('outcome')).toBe(true);
    expect(got.has('exact')).toBe(true);
    expect(got.has('goal_diff')).toBe(true);
    expect(got.has('total_goals')).toBe(true);
    expect(got.has('btts')).toBe(true);
    // Consolation only. Stacking it on an exact hit would double-pay the same call.
    expect(got.has('team_goals')).toBe(false);
  });

  it('team_goals is consolation when one team is exact but the scoreline is wrong', () => {
    const got = hits(settleFixture(prediction(), outcome(3, 1)));
    expect(got.has('team_goals')).toBe(true);
    expect(got.has('outcome')).toBe(true);
    expect(got.has('exact')).toBe(false);
  });

  it('team_goals misses when neither team is exact', () => {
    const got = hits(settleFixture(prediction({ score: { home: 0, away: 0 } }), outcome(3, 1)));
    expect(got.has('team_goals')).toBe(false);
  });

  it('a BTTS override lets a user hedge against their own scoreline', () => {
    const hedged = prediction({ score: { home: 1, away: 0 }, btts: true });
    expect(hits(settleFixture(hedged, outcome(1, 1))).has('btts')).toBe(true);

    const underived = prediction({ score: { home: 1, away: 0 } });
    expect(hits(settleFixture(underived, outcome(1, 1))).has('btts')).toBe(false);
  });

  it('goal-diff and total-goals overrides hedge independently of the scoreline', () => {
    // Wrong scoreline (2-1 against 3-2) but right goal difference (1) and total (5).
    const hedged = prediction({ goalDiff: 1, totalGoals: 5 });
    const got = hits(settleFixture(hedged, outcome(3, 2)));
    expect(got.has('goal_diff')).toBe(true);
    expect(got.has('total_goals')).toBe(true);
    expect(got.has('exact')).toBe(false);
  });

  it('"no scorer" is correct only in a goalless match', () => {
    const noScorer = prediction({
      score: { home: 0, away: 0 },
      firstGoalscorer: { playerId: null, none: true },
    });
    expect(hits(settleFixture(noScorer, outcome(0, 0))).has('first_scorer')).toBe(true);
    expect(
      hits(
        settleFixture(
          noScorer,
          outcome(2, 1, { firstScoringTeamId: HOME as never, firstGoalscorerId: PLAYER_A as never }),
        ),
      ).has('first_scorer'),
    ).toBe(false);
  });

  it('scores the first scorer against equivalent duplicate player ids', () => {
    const pick = prediction({ firstGoalscorer: { playerId: PLAYER_A as never, none: false } });
    const result = outcome(2, 1, {
      firstScoringTeamId: HOME as never,
      firstGoalscorerId: PLAYER_B as never,
      equivalentScorerIds: [PLAYER_A, PLAYER_B] as never,
    });
    expect(hits(settleFixture(pick, result)).has('first_scorer')).toBe(true);
  });
});

describe('settleFixture — first scoring team', () => {
  it('hits when the predicted team opened the scoring', () => {
    const pick = prediction({ firstScoringTeam: { teamId: AWAY as never, none: false } });
    const result = outcome(1, 2, { firstScoringTeamId: AWAY as never });
    expect(hits(settleFixture(pick, result)).has('first_team')).toBe(true);
  });

  it('"no goals" is correct only in a goalless match', () => {
    const pick = prediction({
      score: { home: 0, away: 0 },
      firstScoringTeam: { teamId: null, none: true },
    });
    expect(hits(settleFixture(pick, outcome(0, 0))).has('first_team')).toBe(true);
    expect(
      hits(settleFixture(pick, outcome(1, 0, { firstScoringTeamId: HOME as never }))).has(
        'first_team',
      ),
    ).toBe(false);
  });

  it('an unanswered market simply misses', () => {
    const result = outcome(1, 0, { firstScoringTeamId: HOME as never });
    expect(hits(settleFixture(prediction(), result)).has('first_team')).toBe(false);
  });
});

describe('settleFixture — own goals (new vector)', () => {
  it('no first-scorer pick can hit when the opening goal was an own goal', () => {
    const pick = prediction({ firstGoalscorer: { playerId: PLAYER_A as never, none: false } });
    const result = outcome(1, 0, {
      firstScoringTeamId: HOME as never,
      // The provider names the player who put it in their own net; they scored for the
      // other side, so nobody's first-scorer pick is correct.
      firstGoalscorerId: PLAYER_A as never,
      firstGoalWasOwnGoal: true,
    });
    expect(hits(settleFixture(pick, result)).has('first_scorer')).toBe(false);
  });

  it('an own goal still awards the team that benefited from it', () => {
    const pick = prediction({ firstScoringTeam: { teamId: HOME as never, none: false } });
    const result = outcome(1, 0, {
      firstScoringTeamId: HOME as never,
      firstGoalscorerId: PLAYER_A as never,
      firstGoalWasOwnGoal: true,
    });
    expect(hits(settleFixture(pick, result)).has('first_team')).toBe(true);
  });

  it('own-goal exclusion can be switched off by rule-set params', () => {
    const pick = prediction({ firstGoalscorer: { playerId: PLAYER_A as never, none: false } });
    const result = outcome(1, 0, {
      firstGoalscorerId: PLAYER_A as never,
      firstGoalWasOwnGoal: true,
    });
    const got = settleFixture(pick, result, {
      teamGoalsOnlyWhenExactMissed: true,
      firstScorerExcludesOwnGoals: false,
    });
    expect(hits(got).has('first_scorer')).toBe(true);
  });
});

describe('settleFixture — settled shape', () => {
  it('always returns one component per category, misses included', () => {
    const components = settleFixture(prediction(), outcome(0, 0));
    expect(components).toHaveLength(8);
    // A miss must be a recorded `hit: false`, not an absent row: the leaderboard's
    // accuracy figures depend on telling "wrong" apart from "not settled".
    expect(components.every((c) => typeof c.hit === 'boolean')).toBe(true);
  });

  it('is deterministic — the same inputs always produce the same output', () => {
    const first = settleFixture(prediction(), outcome(2, 1));
    const second = settleFixture(prediction(), outcome(2, 1));
    expect(first).toEqual(second);
  });
});

describe('settleVoidFixture (new vector)', () => {
  it('settles every category to a miss so the round can complete', () => {
    const components = settleVoidFixture();
    expect(components).toHaveLength(8);
    expect(components.every((c) => c.hit === false)).toBe(true);
    expect(valueComponents(components, DEFAULT_WEIGHTS)).toBe(0);
  });
});

describe('valueComponents — phase 2', () => {
  it('values a perfect call at the seeded v1 weights', () => {
    const components = settleFixture(prediction(), outcome(2, 1));
    // outcome 3 + exact 3 + goal_diff 2 + total_goals 1 + btts 1 = 10.
    // team_goals does not fire, and first_team/first_scorer were unanswered.
    expect(valueComponents(components, DEFAULT_WEIGHTS)).toBe(10);
  });

  it('re-values the same hits differently for a league with different weights', () => {
    const components = settleFixture(prediction(), outcome(2, 1));
    const generous = { ...DEFAULT_WEIGHTS, exact: 10 };
    expect(valueComponents(components, generous)).toBe(17);
  });

  it('a category weighted 0 contributes nothing even when it hit', () => {
    const components = settleFixture(prediction(), outcome(3, 1));
    expect(hits(components).has('team_goals')).toBe(true);
    // team_goals is weight 0 in v1, so this hit is settled but worthless until a league
    // switches it on — no re-settlement needed when they do.
    const withTeamGoals = { ...DEFAULT_WEIGHTS, team_goals: 5 };
    expect(valueComponents(components, withTeamGoals) - valueComponents(components, DEFAULT_WEIGHTS)).toBe(5);
  });
});
