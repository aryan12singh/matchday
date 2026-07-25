import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = { title: 'MatchDay' };

/**
 * Landing page. Public by design — an invited friend needs somewhere to land before they
 * have an account.
 *
 * The real marketing surface is not a launch task; this exists so the route tree is
 * complete and signed-out visitors reach a sensible place.
 */
export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-10 px-4 py-16">
      <div className="flex flex-col gap-4">
        <Image src="/wordmark.svg" alt="MatchDay" width={200} height={34} priority />
        <h1 className="font-display text-[28px] font-extrabold leading-tight">
          Predict the season with your mates.
        </h1>
        <p className="max-w-prose text-text-2">
          Every matchweek, every scoreline, settled properly. Private leagues, locked at
          kickoff, with a leaderboard nobody can argue with.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/login"
          className="inline-flex min-h-tap items-center rounded-md bg-accent px-5 font-display text-[13px] font-extrabold uppercase tracking-label text-on-accent"
        >
          Sign in
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-tap items-center rounded-md bg-surface-2 px-5 font-display text-[13px] font-extrabold uppercase tracking-label text-text shadow-el-1"
        >
          Join a league
        </Link>
      </div>
    </main>
  );
}
