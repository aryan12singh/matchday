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

/**
 * Generated Supabase schema types. Regenerate with `pnpm db:types` after any migration.
 *
 * They live in the leaf package so apps/web and packages/jobs share one definition — an
 * untyped client returns PostgREST embeds as arrays, which silently breaks every `.code`
 * access on a joined row.
 */
export type { Database, Json } from './database.types';
