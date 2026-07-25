'use client';

// global-error replaces the root layout, so nothing it renders inherits the layout's
// stylesheet — the tokens have to be imported here explicitly. Doing that rather than
// inlining hex keeps this page on-brand and keeps repo-check's no-hardcoded-hex rule
// intact, which is worth more than the two lines it saves.
import './globals.css';

/**
 * Last-resort boundary: catches errors in the root layout itself, where the normal route
 * boundaries have not mounted. It must render its own <html> and <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center bg-bg px-4 text-text">
        <div className="flex max-w-md flex-col items-start gap-4">
          <p className="label">Something broke</p>
          <h1 className="font-display text-[28px] font-extrabold leading-tight">
            MatchDay hit a problem.
          </h1>
          <p className="text-text-2">
            Your predictions are safe — nothing on this page writes anything. Reload, and
            if it keeps happening it&apos;s on us.
          </p>

          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-tap items-center rounded-md bg-accent px-5 font-display text-[13px] font-extrabold uppercase tracking-label text-on-accent"
          >
            Reload
          </button>

          {error.digest ? (
            <p className="font-num text-[12px] tabular-nums text-text-3">
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
