'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker in production only.
 *
 * Not in development: a service worker that caches build output while Next is
 * hot-reloading serves yesterday's chunks and makes every change look like it did not
 * apply. That confusion costs more than the offline support is worth locally.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration costs offline support and nothing else — the app works
        // fine without it, so this is not worth surfacing to the user.
      });
    };

    // After load, so registration never competes with the first paint.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
