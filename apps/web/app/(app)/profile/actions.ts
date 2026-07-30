'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requireUser } from '../../../lib/auth';
import { NOTIFICATION_TYPES } from '../../../lib/notification-types';
import { createClient } from '../../../lib/supabase/server';

export interface ProfileState {
  error?: string;
  notice?: string;
}

const profile = z.object({
  // Matches the sanitisation handle_new_user applies, so a username chosen here and one
  // derived at signup obey the same rules.
  username: z
    .string()
    .trim()
    .min(3, 'At least 3 characters.')
    .max(24, 'At most 24 characters.')
    .regex(/^[a-z0-9_.-]+$/i, 'Letters, numbers, dot, dash and underscore only.'),
  timezone: z.string().max(64).optional(),
  colorblind: z.union([z.literal('on'), z.null()]).optional(),
});

export async function updateProfile(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const parsed = profile.safeParse({
    username: formData.get('username'),
    timezone: formData.get('timezone') ?? undefined,
    colorblind: formData.get('colorblind'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { error } = await supabase
    .from('profiles')
    .update({
      username: parsed.data.username.toLowerCase(),
      timezone: parsed.data.timezone || null,
      colorblind: parsed.data.colorblind === 'on',
    })
    .eq('id', user.id);

  if (error) {
    // 23505 is the unique index on username — worth its own message, since "could not
    // save" would send someone hunting for a problem with their connection.
    if (error.code === '23505') return { error: 'That username is taken.' };
    return { error: 'Could not save your profile.' };
  }

  revalidatePath('/profile');
  revalidatePath('/', 'layout');
  return { notice: 'Saved.' };
}

/**
 * Rotates the calendar feed token, which invalidates any previously shared URL.
 *
 * The feed is unauthenticated by necessity — calendar clients cannot log in — so the
 * token is the only thing protecting it, and rotating has to be one click.
 */
export async function rotateCalendarToken(): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { error } = await supabase
    .from('profiles')
    .update({ calendar_token: crypto.randomUUID() })
    .eq('id', user.id);

  if (error) return { error: 'Could not rotate the token.' };

  revalidatePath('/profile');
  return { notice: 'New calendar link generated. The old one no longer works.' };
}

export async function updateNotificationPrefs(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const rows = NOTIFICATION_TYPES.flatMap((type) =>
    (['push', 'email'] as const).map((channel) => ({
      user_id: user.id,
      type,
      channel,
      enabled: formData.get(`${type}:${channel}`) === 'on',
      config:
        type === 'deadline_reminder'
          ? { lead_minutes: Number(formData.get('lead_minutes') ?? 180) }
          : null,
    })),
  );

  const { error } = await supabase
    .from('notification_prefs')
    .upsert(rows, { onConflict: 'user_id,type,channel' });

  if (error) return { error: 'Could not save your preferences.' };

  revalidatePath('/settings/notifications');
  return { notice: 'Preferences saved.' };
}


/**
 * Permanent account deletion.
 *
 * Guarded by typing the username rather than a confirm dialog: this cannot be undone, and
 * a dialog is dismissed by reflex. The database function does the work — deleting from
 * auth.users needs privileges the browser will never have.
 */
export async function deleteAccount(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState | never> {
  const user = await requireUser();
  if (!user) return { error: 'Sign in first.' };

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();

  const typed = String(formData.get('confirmUsername') ?? '').trim();
  if (!profile || typed !== profile.username) {
    return { error: 'Type your username exactly to confirm.' };
  }

  const { error } = await supabase.rpc('delete_own_account');

  if (error) {
    // The one refusal worth explaining: a league whose only organizer leaves becomes
    // unadministrable, so the function refuses until somebody else is promoted.
    if (error.code === '23514' && /organizer/i.test(error.message)) {
      return {
        error:
          'You are the only organizer of a league. Promote someone else there first, then delete your account.',
      };
    }
    return { error: 'Could not delete your account.' };
  }

  await supabase.auth.signOut();
  redirect('/login?deleted=1');
}
