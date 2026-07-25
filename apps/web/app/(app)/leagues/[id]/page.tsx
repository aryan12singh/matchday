import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireUser } from '../../../../lib/auth';
import { getClubhouse } from '../../../../lib/clubhouse';
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
  const user = await requireUser(`/leagues/${id}`);

  const league = await getLeague(id);
  // RLS returns nothing for a non-member, which is indistinguishable from "no such
  // league" — and should be: confirming a league exists is itself information.
  if (!league) notFound();

  const isOrganizer = league.role === 'organizer';
  const clubhouse = league.leagueSeasonId
    ? await getClubhouse(league.leagueSeasonId, id, user.id)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
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
              href={`/leagues/${id}/recap`}
              className="inline-flex min-h-tap items-center rounded-md bg-surface-2 px-4 font-display text-[11px] font-bold uppercase tracking-label shadow-el-1"
            >
              Recap
            </Link>
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

      {clubhouse ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="flex flex-col gap-8">
            {clubhouse.standings.length > 0 ? (
              <section className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="label">Standings</h2>
                  <Link
                    href={`/leagues/${id}/leaderboard`}
                    className="min-h-tap font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
                  >
                    Full table
                  </Link>
                </div>
                <ul className="flex flex-col divide-y divide-border">
                  {clubhouse.standings.map((row) => (
                    <li
                      key={row.userId}
                      className={`flex min-h-tap items-center gap-3 py-2 ${
                        row.isYou ? 'border-l-[3px] border-accent pl-3' : 'pl-3'
                      }`}
                    >
                      <span className="w-6 shrink-0 font-num text-[13px] font-bold tabular-nums text-text-2">
                        {row.rank}
                      </span>
                      <span className="flex-1 truncate text-[14px]">{row.username}</span>
                      <span className="font-num text-[14px] font-bold tabular-nums">
                        {row.points}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {clubhouse.rivalry ? (
              <section className="flex flex-col gap-2 rounded-md bg-surface px-5 py-4 shadow-el-1">
                <h2 className="label">Your rivalry</h2>
                <p className="flex items-baseline gap-3 text-[14px]">
                  <span className="font-num text-[24px] font-bold tabular-nums">
                    {clubhouse.rivalry.you.points}
                  </span>
                  <span className="text-text-3">v</span>
                  <span className="font-num text-[24px] font-bold tabular-nums text-text-2">
                    {clubhouse.rivalry.rival.points}
                  </span>
                  <span className="text-text-2">{clubhouse.rivalry.rival.username}</span>
                </p>
                <p className="text-[13px] text-text-2">
                  {clubhouse.rivalry.delta === 0
                    ? 'Dead level. Someone has to blink.'
                    : clubhouse.rivalry.delta > 0
                      ? `You're ${clubhouse.rivalry.delta} clear. Don't get comfortable.`
                      : `${Math.abs(clubhouse.rivalry.delta)} behind. Sort it out.`}
                </p>
              </section>
            ) : null}

            <section className="flex flex-col gap-3">
              <h2 className="label">The room</h2>
              {clubhouse.feed.length === 0 ? (
                <p className="text-[13px] text-text-3">Nothing has happened yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {clubhouse.feed.map((event) => (
                    <li key={event.id} className="flex items-baseline gap-3 py-2">
                      <span className="flex-1 text-[13px] text-text-2">{event.body}</span>
                      <span className="shrink-0 font-num text-[12px] tabular-nums text-text-3">
                        {relativeTime(event.occurredAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="flex flex-col gap-8">
            {clubhouse.records.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h2 className="label">League records</h2>
                <ul className="flex flex-col divide-y divide-border">
                  {clubhouse.records.map((record) => (
                    <li key={record.label} className="flex items-baseline gap-3 py-2">
                      <span className="flex-1 text-[13px] text-text-2">{record.label}</span>
                      <span className="font-num text-[14px] font-bold tabular-nums">
                        {record.value}
                      </span>
                      <span className="w-20 truncate text-right text-[12.5px] text-text-3">
                        {record.holder}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="flex flex-col gap-3">
              <h2 className="label">Members</h2>
              <ul className="flex flex-col divide-y divide-border">
                {league.members.map((member) => (
                  <li key={member.userId} className="flex min-h-tap items-center gap-3 py-2">
                    <span
                      aria-hidden="true"
                      className="flex size-8 items-center justify-center rounded-full bg-surface-3 font-display text-[11px] font-bold uppercase"
                    >
                      {member.username.slice(0, 2)}
                    </span>
                    <span className="flex-1 truncate text-[14px]">{member.username}</span>
                    {member.role === 'organizer' ? (
                      <span className="label text-text-3">Organizer</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : null}

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
    </div>
  );
}

/** Compact relative time for the feed — "3h", "2d". */
function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
