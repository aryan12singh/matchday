/**
 * @matchday/domain — entity types and zod schemas for market values and outcomes.
 *
 * The leaf package: it imports nothing else in the workspace, so `scoring` can depend on
 * it without acquiring any IO, and `provider` can normalise into it without the app ever
 * seeing a provider id.
 */

export * from './ids';
export * from './entities';
export * from './markets';
export * from './scoring';

export const DOMAIN_PACKAGE = '@matchday/domain' as const;
