import type { SeasonTableOutcome, SeasonTableValue } from '@matchday/domain';
import { describe, expect, it } from 'vitest';

import { rankTableRace, scoreSeasonTable } from './season-table';

/**
 * Season table predictor vectors — addendum §C. New competition, no old-repo equivalent.
 * Lowest total_abs wins; it is never merged into weekly or overall points (invariant 8).
 */

const teams = Array.from(
  { length: 20 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
);

const actual: SeasonTableOutcome = { order: teams as never };
const predict = (order: string[]): SeasonTableValue => ({ order: order as never });

describe('scoreSeasonTable', () => {
  it('scores a perfect table at zero — lowest wins', () => {
    const score = scoreSeasonTable(predict(teams), actual);
    expect(score.totalAbs).toBe(0);
    expect(score.totalSq).toBe(0);
    expect(score.exactHits).toBe(20);
    expect(score.championHit).toBe(true);
    expect(score.top4Hits).toBe(4);
    expect(score.relegationHits).toBe(3);
    // A perfect table has no biggest miss worth showing.
    expect(score.biggestMiss).toBeNull();
  });

  it('scores a single swap of adjacent teams as 2', () => {
    const swapped = [...teams];
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    const score = scoreSeasonTable(predict(swapped), actual);
    expect(score.totalAbs).toBe(2);
    expect(score.exactHits).toBe(18);
    expect(score.championHit).toBe(false);
    // Both are still inside the top four, so both top-4 hits survive.
    expect(score.top4Hits).toBe(4);
  });

  it('punishes one catastrophic miss harder than several small ones on total_sq', () => {
    const spread = [...teams];
    [spread[0], spread[1]] = [spread[1]!, spread[0]!];
    [spread[2], spread[3]] = [spread[3]!, spread[2]!];

    const concentrated = [...teams];
    // Move the champion to 5th, shifting three teams up one place each.
    concentrated.splice(4, 0, concentrated.splice(0, 1)[0]!);

    const spreadScore = scoreSeasonTable(predict(spread), actual);
    const concentratedScore = scoreSeasonTable(predict(concentrated), actual);

    expect(spreadScore.totalAbs).toBe(4);
    expect(concentratedScore.totalAbs).toBe(8);
    expect(concentratedScore.totalSq).toBeGreaterThan(spreadScore.totalSq);
  });

  it('reports the biggest miss with its magnitude', () => {
    const reversed = [...teams].reverse();
    const score = scoreSeasonTable(predict(reversed), actual);
    expect(score.biggestMiss).not.toBeNull();
    expect(score.biggestMiss!.diff).toBe(19);
    expect(score.championHit).toBe(false);
  });

  it('counts relegation hits by zone, not by exact position', () => {
    const shuffledBottom = [...teams];
    // Rotate the bottom three among themselves: all still relegated, none exact.
    const bottom = shuffledBottom.splice(17, 3);
    shuffledBottom.push(bottom[2]!, bottom[0]!, bottom[1]!);
    const score = scoreSeasonTable(predict(shuffledBottom), actual);
    expect(score.relegationHits).toBe(3);
    expect(score.exactHits).toBe(17);
  });

  it('scores a team missing from the actual table as maximally wrong rather than skipping it', () => {
    // Keeps totals comparable between users when the table is not yet fully populated.
    const withUnknown = [...teams.slice(0, 19), '00000000-0000-4000-8000-0000000000ff'];
    const score = scoreSeasonTable(predict(withUnknown), actual);
    expect(score.perTeam).toHaveLength(20);
    expect(score.perTeam[19]!.actual).toBe(20);
  });
});

describe('rankTableRace', () => {
  const score = (totalAbs: number, totalSq: number, exactHits = 0) =>
    ({ totalAbs, totalSq, exactHits }) as never;

  it('ranks lowest total first', () => {
    const rows = rankTableRace([
      { userId: 'alice', score: score(40, 200), joinedAt: '2026-07-01T00:00:00Z' },
      { userId: 'bob', score: score(12, 60), joinedAt: '2026-07-02T00:00:00Z' },
    ]);
    expect(rows.map((r) => r.userId)).toEqual(['bob', 'alice']);
    expect(rows[0]!.rank).toBe(1);
  });

  it('breaks a tie on total_sq — the spread-out miss beats the catastrophic one', () => {
    const rows = rankTableRace([
      { userId: 'alice', score: score(20, 200), joinedAt: '2026-07-01T00:00:00Z' },
      { userId: 'bob', score: score(20, 40), joinedAt: '2026-07-02T00:00:00Z' },
    ]);
    expect(rows[0]!.userId).toBe('bob');
  });

  it('then on exact hits, then on join order', () => {
    const rows = rankTableRace([
      { userId: 'alice', score: score(20, 40, 2), joinedAt: '2026-07-03T00:00:00Z' },
      { userId: 'bob', score: score(20, 40, 5), joinedAt: '2026-07-02T00:00:00Z' },
      { userId: 'carol', score: score(20, 40, 5), joinedAt: '2026-07-01T00:00:00Z' },
    ]);
    expect(rows.map((r) => r.userId)).toEqual(['carol', 'bob', 'alice']);
  });

  it('shares a rank when the scoring tiebreaks are exhausted', () => {
    const rows = rankTableRace([
      { userId: 'alice', score: score(20, 40, 5), joinedAt: '2026-07-01T00:00:00Z' },
      { userId: 'bob', score: score(20, 40, 5), joinedAt: '2026-07-02T00:00:00Z' },
    ]);
    expect(rows.map((r) => r.rank)).toEqual([1, 1]);
  });
});
