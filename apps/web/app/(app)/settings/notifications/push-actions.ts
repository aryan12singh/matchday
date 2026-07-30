'use server';

import { z } from 'zod';

import { requireUser } from '../../../../lib/auth';
import { createClient } from '../../../../lib/supabase/server';

/**
 * Storing and removing a browser's push subscription.
 *
 * The subscription is created in the browser — only it can talk to the push service — and
 * handed here to be kept against the user. `endpoint` is unique, so re-subscribing on the
 * same device updates rather than duplicating; browsers hand out a fresh subscription
 * after permission changes and periodically on their own, and without the upsert a person
 * who reinstalled twice would get three copies of every notification.
 */

const subscription = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  userAgent: z.string().max(400).optional(),
});

export type SubscribeResult = { status: 'ok' } | { status: 'error'; message: string };

export async function savePushSubscription(input: unknown): Promise<SubscribeResult> {
  const parsed = subscription.safeParse(input);
  if (!parsed.success) return { status: 'error', message: 'That subscription looked wrong.' };

  const user = await requireUser();
  if (!user) return { status: 'error', message: 'Sign in first.' };

  const supabase = await createClient();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      keys: parsed.data.keys,
      user_agent: parsed.data.userAgent ?? null,
    },
    { onConflict: 'endpoint' },
  );

  if (error) return { status: 'error', message: 'Could not register this device.' };
  return { status: 'ok' };
}

export async function removePushSubscription(endpoint: string): Promise<SubscribeResult> {
  const user = await requireUser();
  if (!user) return { status: 'error', message: 'Sign in first.' };

  const supabase = await createClient();
  // Scoped to the caller: RLS enforces this too, but an endpoint is guessable enough that
  // the filter belongs here as well.
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  if (error) return { status: 'error', message: 'Could not remove this device.' };
  return { status: 'ok' };
}
