import type { Database } from '@matchday/domain';
import { ApiFootballAdapter, type ProviderAdapter, type SeasonRef } from '@matchday/provider';
import type { SupabaseClient } from '@supabase/supabase-js';

type Db = SupabaseClient<Database>;

/**
 * Builds the configured provider adapter, with quota counting attached.
 *
 * This is the only place an adapter should be constructed for production use. Building one
 * inline would skip the ledger, and an uncounted request is worse than an uncounted
 * anything else here: the windowing decides whether to poll based on that number, so a
 * miscount means the tick believes it has budget it has already spent.
 *
 * Returns null rather than throwing when unconfigured. An environment with no provider key
 * is a legitimate state — local development, preview deployments, and the hosted project
 * before the plan is upgraded — and in it the tick still locks, settles and snapshots.
 */

export interface ProviderConfig {
  adapter: ProviderAdapter;
  seasonRef: SeasonRef;
  quotaFloor: number;
}

export function createProviderConfig(client: Db, env = process.env): ProviderConfig | null {
  const apiKey = env.API_FOOTBALL_KEY;
  if (!apiKey) return null;

  const leagueProviderId = env.API_FOOTBALL_LEAGUE_ID ?? '39';
  const seasonYear = Number(env.API_FOOTBALL_SEASON_YEAR ?? new Date().getUTCFullYear());

  // The daily ceiling the tick refuses to cross. Deliberately below the plan's real limit:
  // the bootstrap, an /ops manual sync and the capture script all draw on the same budget,
  // so the automatic half should not be able to consume every last request.
  const quotaFloor = Number(env.API_FOOTBALL_DAILY_BUDGET ?? 0);

  const adapter = new ApiFootballAdapter({
    apiKey,
    baseUrl: env.API_FOOTBALL_BASE_URL,
    onRequest: async () => {
      // Counted before the call rather than after: a request that fails still consumed
      // quota, and a 429 in particular means the budget is already gone.
      const { error } = await client.rpc('record_provider_call', {
        p_provider: 'api-football',
        p_plan_limit: quotaFloor > 0 ? quotaFloor : undefined,
      });
      // A ledger failure must not stop ingestion — an uncounted request is a worse estimate,
      // a blocked one is missing data. The gate errs safe on the next tick either way.
      if (error) console.warn('[quota] failed to record provider call:', error.message);
    },
  });

  return {
    adapter,
    seasonRef: { leagueProviderId, seasonYear },
    quotaFloor,
  };
}
