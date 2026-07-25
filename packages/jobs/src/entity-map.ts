import type { Database } from '@matchday/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

type Db = SupabaseClient<Database>;

export type EntityType = 'competition' | 'season' | 'stage' | 'round' | 'fixture' | 'team' | 'player';

/**
 * provider_entity_map resolution — invariant 1 and 2 in one place.
 *
 * Application code never sees a provider id. Ingestion resolves each provider id to an
 * internal uuid here, creating the entity on first sight, and everything downstream deals
 * only in uuids. This is the specific lesson from the old repo, which scattered
 * `provider_fixture_id` columns and per-provider tables (`fifa_teams`) across the schema
 * and then could not change provider without a migration per table.
 */
export async function resolveEntity(
  client: Db,
  provider: string,
  entityType: EntityType,
  providerId: string,
): Promise<string | null> {
  const { data } = await client
    .from('provider_entity_map')
    .select('internal_id')
    .eq('provider', provider)
    .eq('entity_type', entityType)
    .eq('provider_id', providerId)
    .maybeSingle();

  return data?.internal_id ?? null;
}

export async function mapEntity(
  client: Db,
  provider: string,
  entityType: EntityType,
  providerId: string,
  internalId: string,
): Promise<void> {
  // Natural-key upsert: re-running a bootstrap must not fail, and must not remap an
  // entity that already exists.
  const { error } = await client
    .from('provider_entity_map')
    .upsert(
      { provider, entity_type: entityType, provider_id: providerId, internal_id: internalId },
      { onConflict: 'provider,entity_type,provider_id', ignoreDuplicates: true },
    );

  if (error) throw error;
}

/**
 * Resolve-or-create. `create` runs only when the provider id has never been seen, so a
 * second bootstrap over the same season is a no-op rather than a duplicate set of teams.
 */
export async function resolveOrCreate(
  client: Db,
  provider: string,
  entityType: EntityType,
  providerId: string,
  create: () => Promise<string>,
): Promise<string> {
  const existing = await resolveEntity(client, provider, entityType, providerId);
  if (existing) return existing;

  const internalId = await create();
  await mapEntity(client, provider, entityType, providerId, internalId);
  return internalId;
}
