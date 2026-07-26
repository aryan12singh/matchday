import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireUser } from '../../../../../lib/auth';
import { getLeaderboard } from '../../../../../lib/leaderboard';
import { getLeague } from '../../../../../lib/leagues';
import { createClient } from '../../../../../lib/supabase/server';

import { toggleRival } from './actions';

export const metadata: Metadata = { title: 'Members' };

/** Members and rivals (§4.2 screen 11). */
export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/leagues/${id}/members`);

  const league = await getLeague(id);
  if (!league) notFound();

  const supabase = await createClient();
  const [board, { data: rivals }] = await Promise.all([
    league.leagueSeasonId
      ? getLeaderboard({
          leagueSeasonId: league.leagueSeasonId,
          leagueId: id,
          viewerId: user.id,
        })
      : Promise.resolve({ rows: [], weights: {} }),
    supabase.from('rivals').select('rival_user_id').eq('league_id', id).eq('user_id', user.id),
  ]);

  const pinned = new Set((rivals ?? []).map((r) => r.rival_user_id));
  const byUser = new Map(board.rows.map((row) => [row.userId, row]));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link
        href={`/leagues/${id}`}
        className="inline-flex min-h-tap items-center font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
      >
        ‹ {league.name}
      </Link>

      <header className="flex flex-col gap-1">
        <p className="label">
          <span className="font-num tabular-nums">{league.memberCount}</span>{' '}
          {league.memberCount === 1 ? 'member' : 'members'}
        </p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">Members</h1>
        <p className="text-text-2">
          Pin a rival to see the gap on your home screen.
        </p>
      </header>

      <ul className="flex flex-col divide-y divide-border">
        {league.members.map((member) => {
          const row = byUser.get(member.userId);
          const isSelf = member.userId === user.id;
          const isPinned = pinned.has(member.userId);

          return (
            <li key={member.userId} className="flex flex-wrap items-center gap-3 py-3">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-3 font-display text-[12px] font-bold uppercase"
              >
                {member.username.slice(0, 2)}
              </span>

              <span className="flex flex-1 flex-col gap-0.5 truncate">
                <span className="truncate text-[14px]">
                  {member.username}
                  {isSelf ? <span className="ml-2 label text-accent">You</span> : null}
                  {member.role === 'organizer' ? (
                    <span className="ml-2 label text-text-3">Organizer</span>
                  ) : null}
                </span>
                <span className="text-[12.5px] text-text-3">
                  {row
                    ? `${row.rank}${ordinal(row.rank)} · ${row.points} pts · ${row.accuracy}% outcomes`
                    : 'No points yet'}
                </span>
              </span>

              {!isSelf ? (
                <>
                  <Link
                    href={`/leagues/${id}/h2h/${member.userId}`}
                    className="min-h-tap px-2 font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
                  >
                    H2H
                  </Link>
                  <form action={toggleRival}>
                    <input type="hidden" name="leagueId" value={id} />
                    <input type="hidden" name="rivalId" value={member.userId} />
                    <input type="hidden" name="pinned" value={String(isPinned)} />
                    <button
                      type="submit"
                      aria-pressed={isPinned}
                      className={`min-h-tap rounded-md px-3 font-display text-[11px] font-bold uppercase tracking-label ${
                        isPinned ? 'bg-accent text-on-accent' : 'bg-surface-2 text-text-2'
                      }`}
                    >
                      {isPinned ? 'Rival' : 'Pin'}
                    </button>
                  </form>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}
