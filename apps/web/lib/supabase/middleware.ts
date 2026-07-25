import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { Database } from '@matchday/domain';

/** Routes reachable without a session. Everything else redirects to /login. */
const PUBLIC_PREFIXES = ['/login', '/auth', '/legal', '/install', '/offline'];

/**
 * API routes never redirect. They authenticate themselves — job routes with a bearer
 * CRON_SECRET, everything else with the session — and answer with a status code. A 307 to
 * /login in response to `pg_cron` would silently disable the entire scheduler, which is
 * exactly what happened before this existed.
 */
const isApi = (pathname: string) => pathname.startsWith('/api/');

const isPublic = (pathname: string) =>
  pathname === '/' || PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Refreshes the Supabase session on every request and gates private routes.
 *
 * This is convenience, not security: the database is the control. A request that slips
 * past this still sees only what RLS allows, and still cannot write a prediction after
 * kickoff. The old app leaned on middleware for both, which is how it ended up with a
 * browser-only deadline.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser(), not getSession(): getSession trusts the cookie's contents, getUser
  // revalidates the token with the auth server. Do not replace it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname) && !isApi(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Come back here after signing in.
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/home';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
