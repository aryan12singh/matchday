import type { NextRequest } from 'next/server';

import { updateSession } from './lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Job routes are deliberately
     * included: they authenticate with a bearer CRON_SECRET rather than a session, and
     * running them through here costs one session lookup that always misses.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};
