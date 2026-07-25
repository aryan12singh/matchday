import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '../../../components/ui/EmptyState';
import { requireUser } from '../../../lib/auth';
import { getHomeState } from '../../../lib/home';
import { getMyLeagues } from '../../../lib/leagues';

import { Hero } from './Hero';

export const metadata: Metadata = { title: 'Home' };

/**
 * Home — the adaptive matchweek hub (design/screens/Home v2.dc.html).
 *
 * Hero first, then the leagues strip. The hero's phase is decided on the server; the page
 * itself just lays the pieces out.
 */
export default async function HomePage() {
  const user = await requireUser('/home');
  const [state, leagues] = await Promise.all([getHomeState(user.id), getMyLeagues(user.id)]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6">
      <Hero state={state} />

      <section className="flex flex-col gap-3 lg:max-w-2xl">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="label">Your leagues</h2>
          <Link
            href="/leagues"
            className="min-h-tap font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
          >
            All
          </Link>
        </div>

        {leagues.length === 0 ? (
          <EmptyState
            title="You're not in a league yet."
            body="Predictions only mean something with someone to beat."
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
                  href={`/leagues/${league.id}/leaderboard`}
                  className="flex min-h-tap items-center justify-between gap-4 py-3"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="font-display text-[14px] font-bold">{league.name}</span>
                    <span className="text-[12.5px] text-text-3">
                      <span className="font-num tabular-nums">{league.memberCount}</span>
                      {league.memberCount === 1 ? ' member' : ' members'}
                      {league.selectionMode !== 'all'
                        ? league.selectionMode === 'vote'
                          ? ' · voting on fixtures'
                          : ' · organizer picks'
                        : ''}
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
      </section>
    </div>
  );
}
