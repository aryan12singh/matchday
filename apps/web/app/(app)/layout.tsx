import { requireUser } from '../../lib/auth';
import { getMyLeagues } from '../../lib/leagues';
import { getUnpredictedCount } from '../../lib/predictions';

import { signOut } from '../(public)/login/actions';
import { AppShell } from './AppShell';

/**
 * Authenticated shell. The middleware already redirects signed-out requests, but this
 * checks again: middleware runs on the edge and can be bypassed by a direct RSC request,
 * and a page that renders member data must never depend on a redirect having happened.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Fetched here rather than per-page so the nav badge is consistent everywhere, and so
  // switching tabs does not re-query for the same two things.
  const [leagues, unpredicted] = await Promise.all([
    getMyLeagues(user.id),
    getUnpredictedCount(user.id),
  ]);

  return (
    <AppShell
      username={user.username}
      avatarUrl={user.avatarUrl}
      leagues={leagues.map((league) => ({ id: league.id, name: league.name }))}
      unpredicted={unpredicted}
      signOut={signOut}
    >
      {children}
    </AppShell>
  );
}
