/**
 * @matchday/jobs — job implementations, locks, sync-run bookkeeping, quota ledger,
 * provider-entity resolution, season bootstrap and the settlement engine.
 *
 * The only package permitted to import @matchday/provider (invariant 1). Everything with
 * IO lives here or in the route handlers that call it; @matchday/scoring stays pure.
 */

export * from './locks';
export * from './quota';
export * from './sync-runs';
export * from './entity-map';
export * from './settlement';
export * from './bootstrap';
export * from './snapshots';
export * from './sync-fixtures';
export * from './sync-live';
export * from './sync-final';
export * from './sync-reference';
export * from './windows';
export * from './provider-factory';
export * from './tick';

export const JOBS_PACKAGE = '@matchday/jobs' as const;
