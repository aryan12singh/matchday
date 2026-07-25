import Link from 'next/link';

/**
 * Not-found for authenticated routes.
 *
 * Covers two genuinely different cases with one message on purpose: a league that does
 * not exist, and a league the viewer is not a member of. RLS returns no rows for both,
 * and confirming which is which would tell an outsider that a given league exists.
 */
export default function AppNotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-5 px-4 py-16">
      <div className="flex flex-col gap-2">
        <p className="label">Not found</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">
          There&apos;s nothing here.
        </h1>
        <p className="text-text-2">
          Either this doesn&apos;t exist or it isn&apos;t yours to see. If someone sent you
          a league link, you may need their join code first.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/home"
          className="inline-flex min-h-tap items-center rounded-md bg-accent px-5 font-display text-[13px] font-extrabold uppercase tracking-label text-on-accent"
        >
          Back to home
        </Link>
        <Link
          href="/join"
          className="inline-flex min-h-tap items-center rounded-md bg-surface-2 px-5 font-display text-[13px] font-extrabold uppercase tracking-label text-text shadow-el-1"
        >
          Join a league
        </Link>
      </div>
    </main>
  );
}
