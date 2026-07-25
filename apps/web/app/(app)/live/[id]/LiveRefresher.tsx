'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Refreshes the server components while a match is in play.
 *
 * Polling rather than realtime, deliberately. The realtime publication is narrowed to
 * fixtures and fixture_events (§9.6), so a socket would tell us the score changed but the
 * derived work — provisional points, category states, league picks — still has to be
 * recomputed on the server. router.refresh() does exactly that in one round trip.
 *
 * Pauses when the tab is hidden. A phone left on the live screen in a pocket should not
 * poll for ninety minutes.
 */
export function LiveRefresher({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let timer: number | undefined;

    const start = () => {
      stop();
      timer = window.setInterval(() => {
        router.refresh();
        setStale(false);
      }, intervalMs);
    };

    const stop = () => {
      if (timer) window.clearInterval(timer);
      timer = undefined;
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
        setStale(true);
      } else {
        // Catch up immediately on return rather than waiting out the interval.
        router.refresh();
        setStale(false);
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, intervalMs]);

  // Announced politely so a screen-reader user knows the numbers move on their own.
  return (
    <p aria-live="polite" className="sr-only">
      {stale ? 'Live updates paused while this tab is in the background.' : 'Live updates on.'}
    </p>
  );
}
