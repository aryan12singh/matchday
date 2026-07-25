import 'server-only';

import { redirect } from 'next/navigation';

import { createClient } from './supabase/server';

/**
 * Server-side authorization helpers (§10.3). Every mutating route uses one of these.
 *
 * They check against the database rather than a session claim: `is_platform_admin` lives
 * on `profiles`, and a stale JWT must not confer admin rights.
 */

export interface SessionUser {
  id: string;
  email: string | null;
  username: string;
  avatarUrl: string | null;
  isPlatformAdmin: boolean;
}

/** The signed-in user with their profile, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();

  // getUser revalidates with the auth server; getSession would trust the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, avatar_url, is_platform_admin')
    .eq('id', user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? null,
    // The handle_new_user trigger guarantees a profile row, but a signup that raced a
    // migration should degrade to a usable name rather than a crash.
    username: profile?.username ?? user.email?.split('@')[0] ?? 'player',
    avatarUrl: profile?.avatar_url ?? null,
    isPlatformAdmin: profile?.is_platform_admin ?? false,
  };
}

/** Redirects to /login when signed out. For pages and server actions. */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login');
  }
  return user;
}

/** Throws for route handlers, which should answer 401/403 rather than redirect. */
export async function requireUserOrThrow(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError('Not signed in', 401);
  return user;
}

export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireUserOrThrow();
  if (!user.isPlatformAdmin) throw new AuthError('Not a platform admin', 403);
  return user;
}

/** Organizer of a specific league. Delegates to the SECURITY DEFINER helper in the DB. */
export async function requireOrganizer(leagueId: string): Promise<SessionUser> {
  const user = await requireUserOrThrow();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('is_league_organizer', { p_league_id: leagueId });
  if (error || data !== true) throw new AuthError('Not an organizer of this league', 403);

  return user;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
