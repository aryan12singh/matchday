import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TeamChip } from '../../../../components/match/TeamChip';
import { requireUser } from '../../../../lib/auth';
import { getTeam } from '../../../../lib/teams';

export const metadata: Metadata = { title: 'Team' };

/** Team page: squad with goals and assists, plus fixtures and results. */
export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/teams/${id}`);

  const team = await getTeam(id);
  if (!team) notFound();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
      <Link
        href="/teams"
        className="inline-flex min-h-tap items-center font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
      >
        ‹ Teams
      </Link>

      <header className="flex items-center gap-4">
        <TeamChip code={team.code} name={team.name} size={48} />
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[28px] font-extrabold leading-tight">{team.name}</h1>
          <p className="text-[12.5px] text-text-3">
            {team.position != null ? `${team.position} in the table` : 'Not yet placed'}
            {team.points != null ? ` · ${team.points} pts` : ''}
            {team.form ? ` · form ${team.form}` : ''}
          </p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <section className="flex flex-col gap-3">
          <h2 className="label">Squad</h2>
          {team.squad.length === 0 ? (
            <p className="text-[13px] text-text-3">
              Squad not imported yet. It arrives with the season import.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {team.squad.map((player) => (
                <li key={player.playerId}>
                  <Link
                    href={`/players/${player.playerId}`}
                    className="flex min-h-tap items-center gap-3 py-2"
                  >
                    <span className="w-7 shrink-0 font-num text-[13px] tabular-nums text-text-3">
                      {player.shirtNumber ?? '—'}
                    </span>
                    <span className="flex-1 truncate text-[14px]">{player.name}</span>
                    <span className="w-16 shrink-0 text-[12.5px] text-text-3">
                      {player.position ?? ''}
                    </span>
                    {/* Goals matter here specifically because of first-scorer picks. */}
                    <span className="w-16 shrink-0 text-right font-num text-[12.5px] tabular-nums text-text-2">
                      {player.goals}g {player.assists}a
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="label">Fixtures</h2>
          {team.fixtures.length === 0 ? (
            <p className="text-[13px] text-text-3">No fixtures yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {team.fixtures.map((fixture) => {
                const played = fixture.homeScore != null;
                return (
                  <li key={fixture.id} className="flex items-center gap-2 py-2">
                    <span className="w-8 shrink-0 text-[11px] uppercase tracking-label text-text-3">
                      {fixture.home ? 'H' : 'A'}
                    </span>
                    <span className="flex-1 truncate text-[13px]">{fixture.opponent}</span>
                    {played ? (
                      <span className="font-num text-[13px] font-bold tabular-nums">
                        {fixture.homeScore}:{fixture.awayScore}
                      </span>
                    ) : (
                      <span className="font-num text-[12px] tabular-nums text-text-3">
                        {new Date(fixture.kickoffAt).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
