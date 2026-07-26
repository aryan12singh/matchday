'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

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

const NOTIFICATION_TYPES = [
  'deadline_reminder',
  'lineups_posted',
  'results_and_points',
  'rank_change',
  'recap_ready',
  'voting_open',
  'selection_finalized',
] as const;

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

export { NOTIFICATION_TYPES };
