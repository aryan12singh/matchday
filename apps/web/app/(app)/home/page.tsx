import type { Metadata } from 'next';

import { requireUser } from '../../../lib/auth';

export const metadata: Metadata = { title: 'Home' };

/**
 * Authenticated home. A placeholder until Task 13 builds the real adaptive hero from
 * design/screens/Home v2.dc.html (pre-deadline / live / settled / quiet phases).
 *
 * It exists now so Task 3's acceptance criterion — signup, login and logout end to end —
 * has somewhere to land, and so the auth boundary is exercised on a real page.
 */
export default async function HomePage() {
  const user = await requireUser('/home');

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <p className="label">Signed in</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">
          {user.username}
        </h1>
        <p className="text-text-2">
          Your leagues and this week&apos;s fixtures land here as the screens are built.
        </p>
      </div>
    </main>
  );
}
