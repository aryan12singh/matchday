import type { Metadata } from 'next';
import Link from 'next/link';

import { DeleteAccount } from './DeleteAccount';

import { requireUser } from '../../../lib/auth';
import { createClient } from '../../../lib/supabase/server';

import { ProfileForm } from './ProfileForm';

export const metadata: Metadata = { title: 'Profile' };

/** Profile and settings (§4.2 screen 16). */
export default async function ProfilePage() {
  const user = await requireUser('/profile');
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, timezone, colorblind, calendar_token')
    .eq('id', user.id)
    .single();

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? '';

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-1">
        <p className="label">Account</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">Profile</h1>
        <p className="text-[12.5px] text-text-3">{user.email}</p>
      </header>

      <ProfileForm
        username={profile?.username ?? user.username}
        timezone={profile?.timezone ?? null}
        colorblind={profile?.colorblind ?? false}
        calendarUrl={`${base}/calendar/${profile?.calendar_token ?? ''}`}
      />

      <nav className="flex flex-col gap-2 border-t border-border pt-6">
        <Link
          href="/settings/notifications"
          className="flex min-h-tap items-center justify-between text-[14px]"
        >
          Notifications
          <span aria-hidden="true" className="text-text-3">→</span>
        </Link>
        <Link href="/rules" className="flex min-h-tap items-center justify-between text-[14px]">
          Scoring rules
          <span aria-hidden="true" className="text-text-3">→</span>
        </Link>
        <Link href="/install" className="flex min-h-tap items-center justify-between text-[14px]">
          Install the app
          <span aria-hidden="true" className="text-text-3">→</span>
        </Link>
        <Link href="/legal/terms" className="flex min-h-tap items-center justify-between text-[14px]">
          Terms
          <span aria-hidden="true" className="text-text-3">→</span>
        </Link>
        <Link href="/legal/privacy" className="flex min-h-tap items-center justify-between text-[14px]">
          Privacy
          <span aria-hidden="true" className="text-text-3">→</span>
        </Link>
      </nav>

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="label">Deleting your account</h2>
        <DeleteAccount username={profile?.username ?? user.username} />
      </section>
    </div>
  );
}
