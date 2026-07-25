import { requireUser } from '../../lib/auth';

import { AppHeader } from './AppHeader';

/**
 * Authenticated shell. The middleware already redirects signed-out requests, but this
 * checks again: middleware runs on the edge and can be bypassed by a direct RSC request,
 * and a page that renders member data must never depend on a redirect having happened.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader username={user.username} avatarUrl={user.avatarUrl} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
