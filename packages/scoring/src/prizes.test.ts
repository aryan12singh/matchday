import { describe, expect, it } from 'vitest';

import { allocatePrizes, isZeroSum, parsePrizeScheme } from './prizes';

/**
 * The property every case below checks, one way or another: the allocations sum to the
 * table. A ledger among friends that does not balance means somebody is owed money nobody
 * owes, and the person who spots it stops trusting the rest of the app too.
 */

const entrants = (...ranks: number[]) =>
  ranks.map((rank, i) => ({ userId: `u${i + 1}`, rank }));

const total = (allocations: { amount: number }[]) =>
  Math.round(allocations.reduce((a, b) => a + b.amount, 0) * 100) / 100;

describe('allocatePrizes', () => {
  it('pays a clean table straight down the order', () => {
    const result = allocatePrizes(entrants(1, 2, 3, 4), [10, 5, -5, -10]);

    expect(result.map((r) => r.amount)).toEqual([10, 5, -5, -10]);
    expect(total(result)).toBe(0);
  });

  it('splits a two-way tie across both positions, not double-paying the higher one', () => {
    // Tied for first: they share 1st and 2nd, so £10 and £5 becomes £7.50 each. Paying
    // both £10 would invent £5 that nobody put in.
    const result = allocatePrizes(entrants(1, 1, 3, 4), [10, 5, -5, -10]);

    expect(result[0]!.amount).toBe(7.5);
    expect(result[1]!.amount).toBe(7.5);
    expect(result[2]!.amount).toBe(-5);
    expect(total(result)).toBe(0);
  });

  it('splits a three-way tie across three positions', () => {
    const result = allocatePrizes(entrants(1, 1, 1, 4), [12, 6, 3, -21]);
    // (12 + 6 + 3) / 3 = 7 each.
    expect(result.slice(0, 3).map((r) => r.amount)).toEqual([7, 7, 7]);
    expect(total(result)).toBe(0);
  });

  it('keeps the table balanced when a split does not divide evenly', () => {
    // 10 / 3 = 3.333…, which cannot be paid. The residue lands somewhere deterministic
    // rather than evaporating.
    const result = allocatePrizes(entrants(1, 1, 1), [10, 0, -10]);
    expect(total(result)).toBe(0);
  });

  it('balances across many awkward splits, which is where a lost penny compounds', () => {
    for (const table of [
      [10, 0, -10],
      [7, 3, -4, -6],
      [100, 50, 25, -25, -50, -100],
      [1, 1, 1, -3],
    ]) {
      for (const ranks of [[1, 1, 3], [1, 2, 2], [1, 1, 1], [1, 2, 3]]) {
        if (ranks.length > table.length) continue;
        const result = allocatePrizes(entrants(...ranks), table);
        expect(total(result), `table ${table} ranks ${ranks}`).toBe(
          Math.round(table.slice(0, ranks.length).reduce((a, b) => a + b, 0) * 100) / 100,
        );
      }
    }
  });

  it('reports how many shared a rank, so a split can be explained', () => {
    const result = allocatePrizes(entrants(1, 1, 3), [10, 0, -10]);
    expect(result[0]!.sharedWith).toBe(2);
    expect(result[2]!.sharedWith).toBe(1);
  });

  it('pays nothing to entrants beyond the end of the table', () => {
    const result = allocatePrizes(entrants(1, 2, 3), [10, -10]);
    expect(result[2]!.amount).toBe(0);
  });

  it('handles an empty league and an empty table', () => {
    expect(allocatePrizes([], [10, -10])).toEqual([]);
    expect(allocatePrizes(entrants(1), [])).toEqual([]);
  });

  it('is unaffected by the order entrants arrive in', () => {
    const a = allocatePrizes(entrants(1, 2, 3), [10, 0, -10]);
    const b = allocatePrizes(
      [
        { userId: 'u3', rank: 3 },
        { userId: 'u1', rank: 1 },
        { userId: 'u2', rank: 2 },
      ],
      [10, 0, -10],
    );
    const byUser = (list: typeof a) =>
      Object.fromEntries(list.map((r) => [r.userId, r.amount]));
    expect(byUser(a)).toEqual(byUser(b));
  });
});

describe('isZeroSum', () => {
  it('accepts a balanced table and rejects one that is not', () => {
    expect(isZeroSum([10, 0, -10])).toBe(true);
    expect(isZeroSum([10, 0, -5])).toBe(false);
    expect(isZeroSum([])).toBe(true);
  });

  it('tolerates floating-point noise', () => {
    expect(isZeroSum([0.1, 0.2, -0.3])).toBe(true);
  });
});

describe('parsePrizeScheme', () => {
  it('reads the shape the admin form stores', () => {
    const scheme = parsePrizeScheme('zero_sum_rank_table', {
      overall: [10, -10],
      per_round: [5, -5],
    });
    expect(scheme?.overall).toEqual([10, -10]);
    expect(scheme?.perRound).toEqual([5, -5]);
  });

  it('returns null for junk rather than a half-built scheme', () => {
    expect(parsePrizeScheme('x', null)).toBeNull();
    expect(parsePrizeScheme('x', 'nope')).toBeNull();
    expect(parsePrizeScheme('x', { overall: ['a'] })?.overall).toBeUndefined();
  });
});
