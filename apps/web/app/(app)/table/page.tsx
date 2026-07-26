import type { Metadata } from 'next';
import Link from 'next/link';

import { TeamChip } from '../../../components/match/TeamChip';
import { EmptyState } from '../../../components/ui/EmptyState';
import { requireUser } from '../../../lib/auth';
import { getStandings } from '../../../lib/standings';

export const metadata: Metadata = { title: 'Table' };

/**
 * Competition standings (§4.2 screen 7).
 *
 * Zone colouring is a left rail plus a legend rather than a row tint, so the distinction
 * survives a colourblind reading — and because a tinted row fights the "this is you"
 * treatment used everywhere else.
 *
 * The predicted-position column only appears once the viewer has entered a table, which
 * is what makes this screen useful rather than decorative: it answers "how wrong am I so
 * far" without leaving for the Table race board.
 */
export default async function TablePage() {
  const user = await requireUser('/table');
  const standings = await getStandings(user.id);

  if (standings.rows.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        <h1 className="font-display text-[28px] font-extrabold">Table</h1>
        <EmptyState
          title="No standings yet."
          body="The table fills in once the season is imported and matches start being played."
          action={
            <Link
              href="/season-picks"
              className="inline-flex min-h-tap items-center rounded-md bg-surface-2 px-4 font-display text-[11px] font-bold uppercase tracking-label shadow-el-1"
            >
              Predict the final table →
            </Link>
          }
        />
      </div>
    );
  }

  const total = standings.rows.length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <p className="label">
          {standings.competitionName} {standings.seasonLabel}
        </p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">Table</h1>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <caption className="sr-only">
            {standings.competitionName} {standings.seasonLabel} standings
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="label py-2 pr-2 font-normal">#</th>
              <th scope="col" className="label py-2 pr-4 font-normal">Team</th>
              {standings.hasPrediction ? (
                <th scope="col" className="label py-2 pr-4 text-right font-normal">You said</th>
              ) : null}
              {['P', 'W', 'D', 'L', 'GF', 'GA', 'GD'].map((head) => (
                <th key={head} scope="col" className="label py-2 pr-3 text-right font-normal">
                  {head}
                </th>
              ))}
              <th scope="col" className="label py-2 text-right font-normal">Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.rows.map((row) => {
              const zone =
                row.position <= 4
                  ? 'border-l-[3px] border-success'
                  : row.position === 5
                    ? 'border-l-[3px] border-warning'
                    : row.position > total - 3
                      ? 'border-l-[3px] border-danger'
                      : 'border-l-[3px] border-transparent';

              const drift =
                row.predictedPosition != null ? row.predictedPosition - row.position : null;

              return (
                <tr key={row.teamId} className={`border-b border-border ${zone}`}>
                  <td className="py-2 pl-2 pr-2 font-num text-[13px] tabular-nums text-text-2">
                    {row.position}
                  </td>
                  <td className="py-2 pr-4">
                    <Link
                      href={`/teams/${row.teamId}`}
                      className="flex items-center gap-2 text-[14px] hover:underline"
                    >
                      <TeamChip code={row.code} name={row.name} size={22} />
                      <span className="truncate">{row.name}</span>
                    </Link>
                  </td>
                  {standings.hasPrediction ? (
                    <td className="py-2 pr-4 text-right">
                      <span className="font-num text-[13px] tabular-nums text-text-3">
                        {row.predictedPosition ?? '—'}
                      </span>
                      {drift != null && drift !== 0 ? (
                        <span
                          className={`ml-1 font-num text-[11px] tabular-nums ${
                            Math.abs(drift) <= 2 ? 'text-text-3' : 'text-danger'
                          }`}
                          title={`${Math.abs(drift)} place${Math.abs(drift) === 1 ? '' : 's'} out`}
                        >
                          {drift > 0 ? `▲${drift}` : `▼${Math.abs(drift)}`}
                        </span>
                      ) : null}
                    </td>
                  ) : null}
                  {[row.played, row.won, row.drawn, row.lost, row.goalsFor, row.goalsAgainst].map(
                    (value, i) => (
                      <td key={i} className="py-2 pr-3 text-right font-num text-[13px] tabular-nums text-text-2">
                        {value}
                      </td>
                    ),
                  )}
                  <td className="py-2 pr-3 text-right font-num text-[13px] tabular-nums text-text-2">
                    {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                  </td>
                  <td className="py-2 text-right font-num text-[14px] font-bold tabular-nums">
                    {row.points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Zones are named, not just coloured. */}
      <ul className="flex flex-wrap gap-4 text-[12.5px] text-text-3">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-[3px] rounded-full bg-success" /> Champions League
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-[3px] rounded-full bg-warning" /> Europa League
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-[3px] rounded-full bg-danger" /> Relegation
        </li>
      </ul>

      {!standings.hasPrediction ? (
        <Link
          href="/season-picks"
          className="inline-flex min-h-tap items-center justify-center rounded-md bg-surface-2 px-5 font-display text-[13px] font-extrabold uppercase tracking-label shadow-el-1"
        >
          Predict the final table →
        </Link>
      ) : null}
    </div>
  );
}
