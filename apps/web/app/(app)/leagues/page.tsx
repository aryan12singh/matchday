import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '../../../components/ui/EmptyState';
import { requireUser } from '../../../lib/auth';
import { getMyLeagues } from '../../../lib/leagues';

export const metadata: Metadata = { title: 'Leagues' };

export default async function LeaguesPage() {
  const user = await requireUser('/leagues');
  const leagues = await getMyLeagues(user.id);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-[28px] font-extrabold">Leagues</h1>
        <Link
          href="/leagues/new"
          className="inline-flex min-h-tap items-center rounded-md bg-accent px-4 font-display text-[11px] font-bold uppercase tracking-label text-on-accent"
        >
          New league
        </Link>
      </div>

      {leagues.length === 0 ? (
        <EmptyState
          title="You're not in a league yet."
          body="Start one and share the code, or join with a code someone sent you."
          action={
            <div className="flex flex-wrap gap-3 pt-1">
              <Link
                href="/leagues/new"
                className="inline-flex min-h-tap items-center rounded-md bg-accent px-4 font-display text-[11px] font-bold uppercase tracking-label text-on-accent"
              >
                Create a league
              </Link>
              <Link
                href="/join"
                className="inline-flex min-h-tap items-center rounded-md bg-surface-2 px-4 font-display text-[11px] font-bold uppercase tracking-label text-text shadow-el-1"
              >
                Join with a code
              </Link>
            </div>
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {leagues.map((league) => (
            <li key={league.id}>
              <Link
                href={`/leagues/${league.id}`}
                className="flex min-h-tap items-center justify-between gap-4 py-4"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-display text-[16px] font-bold">{league.name}</span>
                  <span className="text-[12.5px] text-text-3">
                    <span className="font-num tabular-nums">{league.memberCount}</span>
                    {league.memberCount === 1 ? ' member' : ' members'}
                    {league.seasonLabel ? ` · ${league.seasonLabel}` : ''}
                    {league.role === 'organizer' ? ' · organizer' : ''}
                  </span>
                </span>
                <span aria-hidden="true" className="text-text-3">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[12.5px] text-text-3">
        Got a code? <Link href="/join" className="underline underline-offset-4">Join a league</Link>.
      </p>
    </main>
  );
}
