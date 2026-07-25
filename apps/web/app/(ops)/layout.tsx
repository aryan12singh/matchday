import { redirect } from 'next/navigation';

import { getSessionUser } from '../../lib/auth';

/**
 * /ops shell. Platform admins only.
 *
 * Deliberately outside the (app) group: it has no bottom tab bar, no league nav, and it
 * reads through the service client. Mixing it into the member shell would put an
 * admin-only surface one CSS mistake away from being visible.
 *
 * A non-admin is redirected rather than shown a 403, so /ops does not confirm it exists.
 */
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/ops');
  if (!user.isPlatformAdmin) redirect('/home');

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-display text-[13px] font-extrabold uppercase tracking-label">
            MatchDay · ops
          </span>
          <a
            href="/home"
            className="min-h-tap font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
          >
            Back to app
          </a>
        </div>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
