import type { Metadata } from 'next';
import Link from 'next/link';

import { TeamChip } from '../../../components/match/TeamChip';
import { EmptyState } from '../../../components/ui/EmptyState';
import { requireUser } from '../../../lib/auth';
import { getTeams } from '../../../lib/teams';

export const metadata: Metadata = { title: 'Teams' };

/** Teams index (§4.2 screen 15) — the reference layer behind pick decisions. */
export default async function TeamsPage() {
  await requireUser('/teams');
  const { teams, seasonLabel } = await getTeams();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <p className="label">{seasonLabel ?? 'No season'}</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">Teams</h1>
      </header>

      {teams.length === 0 ? (
        <EmptyState
          title="No teams imported yet."
          body="Squads and stats appear once the season is imported."
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {teams.map((team) => (
            <li key={team.id}>
              <Link
                href={`/teams/${team.id}`}
                className="flex min-h-tap items-center gap-3 rounded-md bg-surface px-4 py-3 shadow-el-1"
              >
                {team.position != null ? (
                  <span className="w-6 shrink-0 font-num text-[13px] font-bold tabular-nums text-text-2">
                    {team.position}
                  </span>
                ) : null}
                <TeamChip code={team.code} name={team.name} size={28} />
                <span className="flex flex-1 flex-col gap-0.5 truncate">
                  <span className="truncate text-[14px]">{team.name}</span>
                  <span className="text-[12.5px] text-text-3">
                    {team.squadSize > 0
                      ? `${team.squadSize} in the squad`
                      : 'Squad not imported'}
                    {team.points != null ? ` · ${team.points} pts` : ''}
                  </span>
                </span>
                <span aria-hidden="true" className="text-text-3">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
