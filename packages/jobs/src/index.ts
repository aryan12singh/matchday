/**
 * @matchday/jobs — job implementations, locks, sync-run bookkeeping, quota ledger and
 * the settlement engine.
 *
 * The only package permitted to import @matchday/provider (invariant 1). Everything with
 * IO lives here or in the route handlers that call it; @matchday/scoring stays pure.
 */

export * from './locks';
export * from './quota';
export * from './sync-runs';
export * from './settlement';

export const JOBS_PACKAGE = '@matchday/jobs' as const;
