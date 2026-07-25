'use client';

import { useEffect } from 'react';

import { Button } from '../../components/ui/Button';

/**
 * Error boundary for every authenticated route.
 *
 * Deliberately does not print `error.message`. A Supabase or Postgres error can carry a
 * column name, a constraint, or a row's contents, and this product's threat model is a
 * curious league member — the digest is enough to find it in the logs without showing
 * anyone the schema.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry replaces this once it is wired; console keeps it visible in the meantime.
    console.error('Route error:', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-5 px-4 py-16">
      <div className="flex flex-col gap-2">
        <p className="label">Something broke</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">
          That didn&apos;t load.
        </h1>
        <p className="text-text-2">
          Your predictions are safe — nothing here writes anything. Try again, and if it
          keeps happening it&apos;s on us, not you.
        </p>
      </div>

      <Button onClick={reset}>Try again</Button>

      {error.digest ? (
        <p className="font-num text-[12px] tabular-nums text-text-3">
          Reference {error.digest}
        </p>
      ) : null}
    </div>
  );
}
