import type { Metadata } from 'next';
import Link from 'next/link';

import { requireUser } from '../../../../lib/auth';
import { createClient } from '../../../../lib/supabase/server';

import { NotificationForm } from './NotificationForm';

export const metadata: Metadata = { title: 'Notifications' };

/**
 * Notification settings (§4.2 screen 20).
 *
 * Granular by design — the goal is that notifications stay welcome. Sending is Task 20;
 * these preferences are stored now so the jobs have something to read, and so nobody is
 * opted into anything they did not choose.
 */
export default async function NotificationSettingsPage() {
  const user = await requireUser('/settings/notifications');
  const supabase = await createClient();

  const [{ data: prefs }, { data: devices }] = await Promise.all([
    supabase.from('notification_prefs').select('type, channel, enabled, config').eq('user_id', user.id),
    supabase.from('push_subscriptions').select('id, user_agent, created_at').eq('user_id', user.id),
  ]);

  const map: Record<string, boolean> = {};
  let leadMinutes = 180;
  for (const pref of prefs ?? []) {
    map[`${pref.type}:${pref.channel}`] = pref.enabled;
    const config = pref.config as { lead_minutes?: number } | null;
    if (pref.type === 'deadline_reminder' && config?.lead_minutes) {
      leadMinutes = config.lead_minutes;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8">
      <Link
        href="/profile"
        className="inline-flex min-h-tap items-center font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
      >
        ‹ Profile
      </Link>

      <header className="flex flex-col gap-2">
        <p className="label">Settings</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">Notifications</h1>
        <p className="text-text-2">
          Off by default. Nothing is sent until you turn it on.
        </p>
      </header>

      <NotificationForm
        prefs={map}
        leadMinutes={leadMinutes}
        pushSupported={(devices ?? []).length > 0}
      />

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="label">Devices</h2>
        {(devices ?? []).length === 0 ? (
          <p className="text-[13px] text-text-3">
            No device registered for push yet. Install the app and allow notifications to
            add one.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {(devices ?? []).map((device) => (
              <li key={device.id} className="flex items-baseline gap-3 py-2">
                <span className="flex-1 truncate text-[13px] text-text-2">
                  {device.user_agent ?? 'Unknown device'}
                </span>
                <span className="font-num text-[12px] tabular-nums text-text-3">
                  {new Date(device.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
