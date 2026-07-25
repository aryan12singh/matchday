'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createClient } from '../../../lib/supabase/server';

/**
 * Auth server actions. All three return a message rather than throwing, so the form can
 * render the failure inline — an auth error is an expected outcome, not an exception.
 */

export interface AuthActionState {
  error?: string;
  notice?: string;
}

const credentials = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Passwords must be at least 8 characters.'),
  next: z.string().optional(),
});

const emailOnly = z.object({
  email: z.string().email('Enter a valid email address.'),
  next: z.string().optional(),
});

/** Only same-origin paths, so ?next= cannot be used as an open redirect. */
const safeNext = (next: string | undefined) =>
  next && next.startsWith('/') && !next.startsWith('//') ? next : '/home';

export async function signIn(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Deliberately vague: distinguishing "no such account" from "wrong password" lets
    // anyone test whether an address is registered.
    return { error: 'That email and password do not match.' };
  }

  revalidatePath('/', 'layout');
  redirect(safeNext(parsed.data.next));
}

export async function signUp(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details.' };
  }

  const supabase = await createClient();
  const username = formData.get('username');

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // handle_new_user reads this to seed profiles.username, falling back to the email
      // local part and de-duplicating with a counter.
      data: typeof username === 'string' && username.trim() ? { username: username.trim() } : {},
    },
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  redirect(safeNext(parsed.data.next));
}

export async function sendMagicLink(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailOnly.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a valid email address.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/auth/callback?next=${encodeURIComponent(safeNext(parsed.data.next))}`,
    },
  });

  if (error) return { error: error.message };

  // Same message whether or not the address exists, for the same reason as above.
  return { notice: 'Check your email for a sign-in link.' };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
