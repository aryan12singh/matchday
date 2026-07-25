import type { TableRaceRowView } from '../../../../../lib/leaderboard';

/**
 * Table race — the season table predictor's own board (invariant 8).
 *
 * Lowest score wins, which is the opposite of every other board in the app, so the
 * column is labelled "drift" rather than "points" and the rule is stated on the page.
 * A user who reads this as points will think the leader is losing.
 */
export function TableRaceBoard({ rows }: { rows: TableRaceRowView[] }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-md bg-surface-2 px-4 py-3 text-[13px] text-text-2">
        Total places away from the real table, added up across all 20 teams.{' '}
        <span className="text-text">Lowest wins.</span> Measured against the table as it
        stands today — it moves every matchweek.
      </p>

      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.userId}
            className={`flex min-h-tap items-center gap-3 py-3 ${
              row.isYou ? 'border-l-[3px] border-accent pl-3' : 'pl-3'
            }`}
          >
            <span className="w-7 shrink-0 font-num text-[14px] font-bold tabular-nums text-text-2">
              {row.rank}
            </span>

            <span className="flex flex-1 flex-col gap-0.5 truncate">
              <span className="truncate text-[14px]">
                {row.username}
                {row.isYou ? <span className="ml-2 label text-accent">You</span> : null}
              </span>
              <span className="text-[12.5px] text-text-3">
                <span className="font-num tabular-nums">{row.exactHits}</span> exact
                {row.championHit ? ' · champion right' : ''}
                {row.biggestMiss
                  ? ` · worst miss ${row.biggestMiss.diff} places`
                  : ''}
              </span>
            </span>

            <span className="flex shrink-0 flex-col items-end">
              <span className="font-num text-[16px] font-bold tabular-nums">{row.totalAbs}</span>
              <span className="label text-text-3">drift</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
