import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BREAKER_POLICY,
  type QuotaState,
  recordOutcome,
  remainingBudget,
  shouldCall,
} from './quota';
import { lockKey } from './locks';
import { withRetry } from './sync-runs';

const state = (over: Partial<QuotaState> = {}): QuotaState => ({
  used: 0,
  limit: 7500,
  consecutiveFailures: 0,
  openedAt: null,
  ...over,
});

const NOW = new Date('2026-08-21T15:00:00Z');

describe('quota ledger', () => {
  it('allows calls while under the reserve', () => {
    expect(shouldCall(state({ used: 100 }), NOW)).toEqual({ allow: true });
  });

  it('stops before the provider does, holding back the reserve', () => {
    // API-Football is prepaid with no overage: requests hard-stop at the cap. Running out
    // at 15:00 on a matchday would freeze every fixture mid-match.
    const usable = 7500 * (1 - DEFAULT_BREAKER_POLICY.reserveFraction);
    expect(shouldCall(state({ used: usable }), NOW)).toEqual({
      allow: false,
      reason: 'quota_exhausted',
    });
    expect(shouldCall(state({ used: usable - 1 }), NOW).allow).toBe(true);
  });

  it('reports the remaining budget against the reserve, never below zero', () => {
    expect(remainingBudget(state({ used: 0 }))).toBe(6750);
    expect(remainingBudget(state({ used: 7500 }))).toBe(0);
  });
});

describe('circuit breaker', () => {
  it('opens after the failure threshold', () => {
    let current = state();
    for (let i = 0; i < DEFAULT_BREAKER_POLICY.failureThreshold; i += 1) {
      current = recordOutcome(current, 'failure', NOW);
    }
    expect(current.openedAt).toEqual(NOW);
    expect(shouldCall(current, NOW)).toMatchObject({ allow: false, reason: 'breaker_open' });
  });

  it('counts a failed call against quota — the provider counted it too', () => {
    expect(recordOutcome(state(), 'failure', NOW).used).toBe(1);
  });

  it('allows a single probe once the cooldown elapses', () => {
    const open = state({ openedAt: NOW, consecutiveFailures: 5 });
    const during = new Date(NOW.getTime() + DEFAULT_BREAKER_POLICY.cooldownMs - 1);
    const after = new Date(NOW.getTime() + DEFAULT_BREAKER_POLICY.cooldownMs);

    expect(shouldCall(open, during).allow).toBe(false);
    expect(shouldCall(open, after).allow).toBe(true);
  });

  it('resets on success', () => {
    const open = state({ openedAt: NOW, consecutiveFailures: 5 });
    const recovered = recordOutcome(open, 'success', NOW);
    expect(recovered.openedAt).toBeNull();
    expect(recovered.consecutiveFailures).toBe(0);
  });
});

describe('lockKey', () => {
  it('is stable for the same scope', () => {
    expect(lockKey('settle:fixture:abc')).toBe(lockKey('settle:fixture:abc'));
  });

  it('separates different scopes', () => {
    expect(lockKey('settle:fixture:abc')).not.toBe(lockKey('settle:fixture:abd'));
  });

  it('stays inside the signed 32-bit range Postgres accepts', () => {
    for (const scope of ['a', 'sync_live:PL-2026', 'settle:fixture:' + 'x'.repeat(64)]) {
      const key = lockKey(scope);
      expect(Number.isSafeInteger(key)).toBe(true);
      expect(key).toBeGreaterThanOrEqual(-(2 ** 31));
      expect(key).toBeLessThan(2 ** 31);
    }
  });
});

describe('withRetry', () => {
  it('returns the first success without sleeping', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries with exponential backoff plus jitter', async () => {
    const delays: number[] = [];
    let calls = 0;

    await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('boom');
        return 'ok';
      },
      {
        baseDelayMs: 100,
        sleep: async (ms) => {
          delays.push(ms);
        },
        random: () => 0.5,
      },
    );

    // 100 + 50 jitter, then 200 + 100 jitter. Jitter matters: the tick fires on a
    // schedule, so without it every failing job retries in lockstep.
    expect(delays).toEqual([150, 300]);
  });

  it('gives up after the attempt limit and rethrows the last error', async () => {
    await expect(
      withRetry(
        async () => {
          throw new Error('always fails');
        },
        { attempts: 2, sleep: async () => {} },
      ),
    ).rejects.toThrow('always fails');
  });

  it('does not retry an error the caller marks unretryable', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error('401');
        },
        { isRetryable: () => false, sleep: async () => {} },
      ),
    ).rejects.toThrow('401');
    expect(calls).toBe(1);
  });
});
