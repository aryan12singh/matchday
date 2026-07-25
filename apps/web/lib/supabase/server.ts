import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from '../database.types';

/**
 * Server-side Supabase client carrying the request's session cookies, so RLS evaluates
 * as the signed-in user. Use in server components, route handlers and server actions.
 *
 * Still the anon key: server rendering does not mean server trust. Anything that must
 * bypass RLS uses ./service, which route handlers alone may import.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components cannot set cookies. The middleware refreshes the session
            // on every request, so losing the write here is harmless.
          }
        },
      },
    },
  );
}
