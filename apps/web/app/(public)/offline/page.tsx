import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Offline' };

/**
 * Served by the service worker when a navigation fails.
 *
 * Says plainly that nothing was lost, because the thing a user fears when a prediction
 * app goes offline is that their picks went with it. They did not: saves are confirmed by
 * the server or rolled back, never left in limbo.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <p className="label">No connection</p>
      <h1 className="font-display text-[28px] font-extrabold leading-tight">You&apos;re offline.</h1>
      <p className="text-text-2">
        Anything you saved earlier is safe on the server — predictions are only ever
        confirmed or rolled back, never left half-written. Reconnect and carry on.
      </p>
    </main>
  );
}
