'use client';

import { Button } from '../../components/ui/Button';

/** Error boundary for the public routes — landing, login, auth callback. */
export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4">
      <h1 className="font-display text-[28px] font-extrabold leading-tight">
        That didn&apos;t load.
      </h1>
      <p className="text-text-2">Try again — signing in should still work.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
