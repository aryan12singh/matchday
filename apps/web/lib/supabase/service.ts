import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@matchday/domain';

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Guarded three ways, because a service-role key in a client bundle is the worst
 * single failure this codebase can have:
 *   1. `import 'server-only'` — the build fails if a client component imports this.
 *   2. eslint.config.mjs — components and pages may not import `**\/lib/supabase/service`.
 *   3. scripts/repo-check.ts — SUPABASE_SERVICE_ROLE_KEY may not appear in any
 *      client-reachable file, and never as NEXT_PUBLIC_.
 *
 * Reach for this only in route handlers and jobs, and only where RLS genuinely must be
 * bypassed: settlement writing score components for other users, sync jobs writing
 * reference data, /ops reads. Reading "as the user" is ./server's job.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Service client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
