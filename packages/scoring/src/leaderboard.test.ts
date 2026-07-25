import { DEFAULT_WEIGHTS } from '@matchday/domain';
import { describe, expect, it } from 'vitest';

import {
  type ComponentRow,
  type LeaderboardMember,
  aggregateLeaderboard,
  currentStreak,
} from './leaderboard';

/**
 * Tiebreak-chain vectors ported from ../wc26-predictor/lib/leaderboard.test.ts, plus the
 * cases the old board could not hit: components arriving for a non-member (predictions
 * are global now) and rank sharing on a genuine tie.
 */

const members: LeaderboardMember[] = [
  { userId: 'alice', username: 'alice', joinedAt: '2026-07-01T00:00:00Z' },
  { userId: 'bob', username: 'bob', joinedAt: '2026-07-02T00:00:00Z' },
  { userId: 'carol', username: 'carol', joinedAt: '2026-07-03T00:00:00Z' },
];

const component = (
  userId: string,
  marketId: string,
  category: ComponentRow['category'],
  hit: boolean,
): ComponentRow => ({ userId, marketId, category, hit });

describe('aggregateLeaderboard', () => {
  it('seeds every member at zero so the league appears before a ball is kicked', () => {
    const rows = aggregateLeaderboard({ components: [], members, weights: DEFAULT_WEIGHTS });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.points === 0 && r.submissions === 0)).toBe(true);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 1]);
  });

  it('values hits with the league weights', () => {
    const rows = aggregateLeaderboard({
      components: [
        component('alice', 'm1', 'outcome', true), // 3
        component('alice', 'm1', 'exact', true), // 3
        component('bob', 'm1', 'outcome', true), // 3
        component('bob', 'm1', 'exact', false),
      ],
      members,
      weights: DEFAULT_WEIGHTS,
    });
    expect(rows[0]).toMatchObject({ userId: 'alice', points: 6, rank: 1 });
    expect(rows[1]).toMatchObject({ userId: 'bob', points: 3, rank: 2 });
  });

  it('breaks a points tie on correct outcomes before exact scorelines', () => {
    // Both on 6: alice from two outcomes, bob from one outcome + one exact.
    const rows = aggregateLeaderboard({
      components: [
        component('alice', 'm1', 'outcome', true),
        component('alice', 'm2', 'outcome', true),
        component('bob', 'm1', 'outcome', true),
        component('bob', 'm1', 'exact', true),
      ],
      members,
      weights: DEFAULT_WEIGHTS,
    });
    expect(rows[0]!.points).toBe(6);
    expect(rows[1]!.points).toBe(6);
    expect(rows[0]!.userId).toBe('alice');
  });

  it('counts submissions as distinct markets, not components', () => {
    const rows = aggregateLeaderboard({
      components: [
        component('alice', 'm1', 'outcome', true),
        component('alice', 'm1', 'exact', false),
        component('alice', 'm1', 'btts', false),
        component('alice', 'm2', 'outcome', false),
      ],
      members,
      weights: DEFAULT_WEIGHTS,
    });
    expect(rows.find((r) => r.userId === 'alice')!.submissions).toBe(2);
  });

  it('uses submissions only once every accuracy category is level', () => {
    // Both have one outcome hit. alice entered a second fixture and got nothing from it,
    // so she edges bob on the very last decider.
    const rows = aggregateLeaderboard({
      components: [
        component('alice', 'm1', 'outcome', true),
        component('alice', 'm2', 'outcome', false),
        component('bob', 'm1', 'outcome', true),
      ],
      members,
      weights: DEFAULT_WEIGHTS,
    });
    expect(rows[0]!.userId).toBe('alice');
    expect(rows[0]!.points).toBe(rows[1]!.points);
  });

  it('shares a rank when users are tied through the entire chain', () => {
    const rows = aggregateLeaderboard({
      components: [
        component('alice', 'm1', 'outcome', true),
        component('bob', 'm1', 'outcome', true),
      ],
      members,
      weights: DEFAULT_WEIGHTS,
    });
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.rank).toBe(1);
    expect(rows[2]!.rank).toBe(3);
  });

  it('ignores components from users who are not in this league', () => {
    // Predictions are global: the same settled component is read by every league the
    // predictor belongs to, and by none of the ones they do not.
    const rows = aggregateLeaderboard({
      components: [
        component('alice', 'm1', 'outcome', true),
        component('stranger', 'm1', 'outcome', true),
      ],
      members,
      weights: DEFAULT_WEIGHTS,
    });
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => r.userId === 'stranger')).toBe(false);
  });

  it('reports outcome accuracy against markets entered', () => {
    const rows = aggregateLeaderboard({
      components: [
        component('alice', 'm1', 'outcome', true),
        component('alice', 'm2', 'outcome', true),
        component('alice', 'm3', 'outcome', false),
        component('alice', 'm4', 'outcome', false),
      ],
      members,
      weights: DEFAULT_WEIGHTS,
    });
    expect(rows.find((r) => r.userId === 'alice')!.accuracy).toBe(50);
  });

  it('marks the viewer', () => {
    const rows = aggregateLeaderboard({
      components: [],
      members,
      weights: DEFAULT_WEIGHTS,
      viewerId: 'bob',
    });
    expect(rows.filter((r) => r.isYou).map((r) => r.userId)).toEqual(['bob']);
  });

  it('honours a league-specific tiebreak chain', () => {
    // A league that ranks first-scorer hits ahead of exact scorelines.
    const rows = aggregateLeaderboard({
      components: [
        component('alice', 'm1', 'exact', true),
        component('bob', 'm1', 'first_scorer', true),
      ],
      members,
      weights: { ...DEFAULT_WEIGHTS, exact: 4, first_scorer: 4 },
      tiebreaks: ['points', 'first_scorer', 'exact'],
    });
    expect(rows[0]!.userId).toBe('bob');
  });
});

describe('currentStreak', () => {
  it('counts consecutive correct outcomes from the most recent backwards', () => {
    expect(currentStreak([true, true, false, true])).toBe(2);
    expect(currentStreak([false, true, true])).toBe(0);
    expect(currentStreak([])).toBe(0);
  });
});
