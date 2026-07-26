import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireUser } from '../../../../lib/auth';
import { getPlayer } from '../../../../lib/teams';

export const metadata: Metadata = { title: 'Player' };

/**
 * Player page (§4.2 screen 15).
 *
 * "Opened the scoring N times" is the stat this app actually needs — first scorer is the
 * highest-weighted category in the default rule set, and total goals is a poor proxy for
 * it. A striker who always scores the third goal is worth less here than one who scores
 * early.
 */
export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/players/${id}`);

  const player = await getPlayer(id);
  if (!player) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8">
      {player.teamId ? (
        <Link
          href={`/teams/${player.teamId}`}
          className="inline-flex min-h-tap items-center font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
        >
          ‹ {player.teamName}
        </Link>
      ) : null}

      <header className="flex flex-col gap-2">
        <p className="label">
          {[player.position, player.nationality, player.teamName].filter(Boolean).join(' · ')}
        </p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">
          {player.shirtNumber != null ? (
            <span className="mr-3 font-num text-text-3">{player.shirtNumber}</span>
          ) : null}
          {player.name}
        </h1>
        {player.fullName !== player.name ? (
          <p className="text-[12.5px] text-text-3">{player.fullName}</p>
        ) : null}
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Goals" value={player.goals} />
        <Stat label="Assists" value={player.assists} />
        <Stat label="Apps" value={player.appearances} />
        <Stat label="Opened scoring" value={player.firstGoals} highlight />
      </section>

      {player.firstGoals > 0 ? (
        <p className="rounded-md bg-surface-2 px-4 py-3 text-[13px] text-text-2">
          Has opened the scoring{' '}
          <span className="font-num tabular-nums text-text">{player.firstGoals}</span>{' '}
          {player.firstGoals === 1 ? 'time' : 'times'} this season — first scorer is the
          highest-value category in most rule sets.
        </p>
      ) : (
        <p className="text-[13px] text-text-3">
          Hasn&apos;t opened the scoring yet this season.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface px-4 py-3 shadow-el-1">
      <span
        className={`font-num text-[24px] font-bold tabular-nums ${highlight ? 'text-accent' : ''}`}
      >
        {value}
      </span>
      <span className="label text-text-3">{label}</span>
    </div>
  );
}
