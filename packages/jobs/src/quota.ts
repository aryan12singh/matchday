/**
 * Provider quota ledger and circuit breaker.
 *
 * API-Football plans are prepaid with no overage: requests hard-stop at the cap
 * (addendum §F). On a matchday that means running out of quota at 15:00 leaves every
 * fixture frozen mid-match with no way to buy more. So the ledger is load-bearing, not
 * telemetry — it exists to make us stop *before* the provider does.
 *
 * The pure decision logic lives here so it can be tested without a database or a network.
 */

export interface QuotaState {
  used: number;
  limit: number;
  /** Consecutive failures observed since the last success. */
  consecutiveFailures: number;
  /** When the breaker opened, if it is open. */
  openedAt: Date | null;
}

export interface BreakerPolicy {
  /** Stop issuing calls once this fraction of the daily cap is spent. */
  reserveFraction: number;
  /** Failures in a row before the breaker opens. */
  failureThreshold: number;
  /** How long the breaker stays open before allowing a probe. */
  cooldownMs: number;
}

export const DEFAULT_BREAKER_POLICY: BreakerPolicy = {
  // Hold back 10% of the day's quota. Live polling is bursty and a matchday that starts
  // at 90% spent will not finish; the reserve is what lets final-score syncs land.
  reserveFraction: 0.1,
  failureThreshold: 5,
  cooldownMs: 60_000,
};

export type CallDecision =
  | { allow: true }
  | { allow: false; reason: 'quota_exhausted' | 'breaker_open'; retryAfterMs?: number };

/** Whether a provider call may be made right now. Pure. */
export function shouldCall(
  state: QuotaState,
  now: Date,
  policy: BreakerPolicy = DEFAULT_BREAKER_POLICY,
): CallDecision {
  if (state.openedAt != null) {
    const elapsed = now.getTime() - state.openedAt.getTime();
    if (elapsed < policy.cooldownMs) {
      return { allow: false, reason: 'breaker_open', retryAfterMs: policy.cooldownMs - elapsed };
    }
    // Cooldown elapsed: allow a single probe. A success resets the breaker.
    return { allow: true };
  }

  const usable = Math.floor(state.limit * (1 - policy.reserveFraction));
  if (state.used >= usable) {
    return { allow: false, reason: 'quota_exhausted' };
  }

  return { allow: true };
}

/** Next breaker state after a call. Pure. */
export function recordOutcome(
  state: QuotaState,
  outcome: 'success' | 'failure',
  now: Date,
  policy: BreakerPolicy = DEFAULT_BREAKER_POLICY,
): QuotaState {
  if (outcome === 'success') {
    return { ...state, used: state.used + 1, consecutiveFailures: 0, openedAt: null };
  }

  const failures = state.consecutiveFailures + 1;
  return {
    ...state,
    // A failed call still consumed quota — the provider counted it even if we got nothing.
    used: state.used + 1,
    consecutiveFailures: failures,
    openedAt: failures >= policy.failureThreshold ? now : state.openedAt,
  };
}

/** Remaining calls before the reserve, for the /ops board. */
export function remainingBudget(
  state: QuotaState,
  policy: BreakerPolicy = DEFAULT_BREAKER_POLICY,
): number {
  return Math.max(0, Math.floor(state.limit * (1 - policy.reserveFraction)) - state.used);
}
