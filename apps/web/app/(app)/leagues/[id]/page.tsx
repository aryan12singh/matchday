import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireUser } from '../../../../lib/auth';
import { getLeague } from '../../../../lib/leagues';

import { JoinCodePanel } from './JoinCodePanel';
import { LeagueSettingsForm } from './LeagueSettingsForm';

export const metadata: Metadata = { title: 'League' };

/**
 * League home, minimal launch version. The clubhouse depth from
 * design/screens/League Home.dc.html — rivalry module, trophy cabinet, records, banter
 * feed — is Phase 3 per docs/plan/launch-calendar.md. What ships now is the part the
 * league cannot operate without: who is in it, how to invite them, and the settings that
 * change how scoring works.
 */
export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/leagues/${id}`);

  const league = await getLeague(id);
  // RLS returns nothing for a non-member, which is indistinguishable from "no such
  // league" — and should be: confirming a league exists is itself information.
  if (!league) notFound();

  const isOrganizer = league.role === 'organizer';

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <p className="label">{league.seasonLabel ?? 'No season yet'}</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">{league.name}</h1>
        <p className="text-[12.5px] text-text-3">
          <span className="font-num tabular-nums">{league.memberCount}</span>
          {league.memberCount === 1 ? ' member' : ' members'}
          {league.selectionMode !== 'all'
            ? ` · ${league.selectionMode === 'vote' ? 'members vote on fixtures' : 'organizer picks fixtures'}`
            : ' · all fixtures count'}
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {league.leagueSeasonId ? (
          <>
            <Link
              href={`/leagues/${id}/leaderboard`}
              className="inline-flex min-h-tap items-center rounded-md bg-surface-2 px-4 font-display text-[11px] font-bold uppercase tracking-label shadow-el-1"
            >
              Leaderboard
            </Link>
            {league.selectionMode !== 'all' ? (
              <Link
                href={`/leagues/${id}/selection`}
                className="inline-flex min-h-tap items-center rounded-md bg-surface-2 px-4 font-display text-[11px] font-bold uppercase tracking-label shadow-el-1"
              >
                {league.selectionMode === 'vote' ? 'Vote on fixtures' : 'Pick fixtures'}
              </Link>
            ) : null}
          </>
        ) : null}
        <Link
          href="/predict"
          className="inline-flex min-h-tap items-center rounded-md bg-accent px-4 font-display text-[11px] font-bold uppercase tracking-label text-on-accent"
        >
          Predict
        </Link>
      </nav>

      {isOrganizer && league.joinCode ? <JoinCodePanel leagueId={id} code={league.joinCode} /> : null}

      <section className="flex flex-col gap-3">
        <h2 className="label">Members</h2>
        <ul className="flex flex-col divide-y divide-border">
          {league.members.map((member) => (
            <li key={member.userId} className="flex min-h-tap items-center gap-3 py-3">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-surface-3 font-display text-[11px] font-bold uppercase"
              >
                {member.username.slice(0, 2)}
              </span>
              <span className="flex-1 text-[14px]">{member.username}</span>
              {member.role === 'organizer' ? (
                <span className="label text-text-3">Organizer</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {isOrganizer && league.leagueSeasonId ? (
        <section className="flex flex-col gap-3">
          <h2 className="label">League settings</h2>
          <LeagueSettingsForm
            leagueSeasonId={league.leagueSeasonId}
            revealPolicy={league.revealPolicy}
            selectionMode={league.selectionMode}
          />
        </section>
      ) : null}

      {/*
        Money UI is gated on the league having a prize scheme (design/README.md §6).
        A points-only league renders none of it — not a zeroed column, none of it.
      */}
      {league.prizeSchemeId ? (
        <section className="flex flex-col gap-2">
          <h2 className="label">Prizes</h2>
          <p className="text-[13px] text-text-2">
            This league keeps a prize ledger. Settlement history lands with the prize
            engine.
          </p>
        </section>
      ) : null}
    </main>
  );
}
