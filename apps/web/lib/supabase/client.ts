import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@matchday/domain';

/**
 * Browser Supabase client. Anon key only — every read it performs is filtered by the RLS
 * policies in supabase/migrations/20260725120200_rls_policies.sql, which is the point:
 * the browser is never trusted, so it is given a key that cannot see anything the user
 * should not.
 *
 * Never import this from a server component; use ./server instead so the request's
 * cookies travel with the query.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
