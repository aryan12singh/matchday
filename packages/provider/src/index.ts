/**
 * @matchday/provider — ProviderAdapter interface, the API-Football implementation and
 * pure normalizers.
 *
 * Importable ONLY from @matchday/jobs and apps/web/app/api/{jobs,ops} (invariant 1).
 * Browsers never reach the provider: everything flows adapter -> raw_payloads archive ->
 * normalizers -> internal tables, and app code addresses entities by internal uuid
 * through provider_entity_map.
 */

export * from './adapter';
export * from './normalizers';
export * from './requests';
export * from './api-football';
export * from './fpl';
export * from './replay';

export const PROVIDER_PACKAGE = '@matchday/provider' as const;
