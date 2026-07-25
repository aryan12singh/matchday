import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CountUp } from '../../../../../components/ui/CountUp';
import { EmptyState } from '../../../../../components/ui/EmptyState';
import { requireUser } from '../../../../../lib/auth';
import { getLeague } from '../../../../../lib/leagues';
import { getRecap } from '../../../../../lib/recap';
import { createClient } from '../../../../../lib/supabase/server';

export const metadata: Metadata = { title: 'Recap' };

/**
 * Matchweek recap — design/screens/Recap.dc.html.
 *
 * The winner hero, the week in numbers, the story beats. Celebration is graded: a
 * matchweek win gets the hero treatment, and only a perfect week would get confetti —
 * which is why there is none here.
 */
export default async function RecapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ round?: string }>;
}) {
  const { id } = await params;
  const { round } = await searchParams;
  const user = await requireUser(`/leagues/${id}/recap`);

  const league = await getLeague(id);
  if (!league || !league.leagueSeasonId) notFound();

  const supabase = await createClient();
  const { data: latest } = round
    ? { data: { id: round } }
    : await supabase
        .from('rounds')
        .select('id')
        .eq('status', 'completed')
        .order('number', { ascending: false })
        .limit(1)
        .maybeSingle();

  const recap = latest ? await getRecap(league.leagueSeasonId, id, latest.id, user.id) : null;

  if (!recap) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
        <h1 className="font-display text-[28px] font-extrabold">Recap</h1>
        <EmptyState
          title="No matchweek has settled yet."
          body="Once a round finishes and settles, the recap writes itself."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6">
      <Link
        href={`/leagues/${id}`}
        className="inline-flex min-h-tap items-center font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
      >
        ‹ {league.name}
      </Link>

      {/* ---------------- winner hero ---------------- */}
      <section
        className="hero-band -mx-4 flex flex-col gap-4 px-4 py-8"
        style={{ ['--hero-tint' as string]: 'var(--prize-dim)' }}
      >
        <p className="label">{recap.roundName} · settled</p>

        {recap.winner ? (
          <>
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-full bg-surface-3 font-display text-[14px] font-bold uppercase"
              >
                {recap.winner.username.slice(0, 2)}
              </span>
              <h1 className="font-display text-[32px] font-black uppercase leading-none sm:text-[40px]">
                {recap.winner.isYou ? 'You take it' : `${recap.winner.username} takes it`}
              </h1>
            </div>
            <p className="font-num text-[28px] font-bold tabular-nums">
              <CountUp value={recap.winner.points} /> pts
            </p>
            {recap.runnerUp ? (
              <p className="text-text-2">
                {recap.runnerUp.username} ran{' '}
                {recap.winner.isYou ? 'you' : 'them'} to the final whistle on{' '}
                <span className="font-num tabular-nums">{recap.runnerUp.points}</span>.
              </p>
            ) : null}
          </>
        ) : (
          <h1 className="font-display text-[28px] font-extrabold">Nobody scored this week.</h1>
        )}
      </section>

      {/* ---------------- week in numbers ---------------- */}
      <section className="grid grid-cols-3 gap-3">
        <Stat label="League pts" value={recap.totals.leaguePoints} />
        <Stat label="Exact scores" value={recap.totals.exactScores} />
        <Stat label="Playing" value={recap.totals.members} />
      </section>

      {/* ---------------- story beats ---------------- */}
      {recap.stories.length > 0 ? (
        <section className="grid gap-3 sm:grid-cols-2">
          {recap.stories.map((story) => (
            <article
              key={story.kind}
              className="flex flex-col gap-2 rounded-md bg-surface px-5 py-4 shadow-el-1"
            >
              <h2 className="label">{story.title}</h2>
              <p className="text-[14px] text-text-2">{story.body}</p>
            </article>
          ))}
        </section>
      ) : null}

      {/* ---------------- standings ---------------- */}
      <section className="flex flex-col gap-3">
        <h2 className="label">The week</h2>
        <ul className="flex flex-col divide-y divide-border">
          {recap.standings.map((row) => (
            <li
              key={row.username}
              className={`flex min-h-tap items-center gap-3 py-3 ${
                row.isYou ? 'border-l-[3px] border-accent pl-3' : 'pl-3'
              }`}
            >
              <span className="w-7 shrink-0 font-num text-[14px] font-bold tabular-nums text-text-2">
                {row.rank}
              </span>
              <span className="flex-1 truncate text-[14px]">
                {row.username}
                {row.isYou ? <span className="ml-2 label text-accent">You</span> : null}
              </span>
              <span className="font-num text-[16px] font-bold tabular-nums">{row.points}</span>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href={`/leagues/${id}/leaderboard`}
        className="inline-flex min-h-tap items-center justify-center rounded-md bg-surface-2 px-5 font-display text-[13px] font-extrabold uppercase tracking-label shadow-el-1"
      >
        Full leaderboard →
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface px-4 py-3 shadow-el-1">
      <span className="font-num text-[24px] font-bold tabular-nums">
        <CountUp value={value} />
      </span>
      <span className="label text-text-3">{label}</span>
    </div>
  );
}
