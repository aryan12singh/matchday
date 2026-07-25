'use client';

import { useState } from 'react';

import type { LeaderboardRow } from '@matchday/scoring';

/**
 * Standings with expandable per-category breakdown — design/screens/Leaderboard v2.
 *
 * Rows expand rather than linking away, because the question a leaderboard provokes is
 * "how did they get that?" and the answer should not cost a navigation.
 *
 * `hasPrizes` gates every money-bearing element. A points-only league renders no money
 * column at all — not a zeroed one (design/README.md rule 6).
 */
export function LeaderboardTable({
  rows,
  hasPrizes,
}: {
  rows: LeaderboardRow[];
  hasPrizes: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const you = rows.find((row) => row.isYou);

  return (
    <div className="flex flex-col gap-5">
      {you ? <MyContext rows={rows} you={you} /> : null}

      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row) => {
          const open = expanded === row.userId;

          return (
            <li key={row.userId}>
              <button
                type="button"
                onClick={() => setExpanded(open ? null : row.userId)}
                aria-expanded={open}
                className={`flex min-h-tap w-full items-center gap-3 py-3 text-left ${
                  // The viewer's own row gets a rail, not just a tint, so it is findable
                  // without relying on colour.
                  row.isYou ? 'border-l-[3px] border-accent pl-3' : 'pl-3'
                }`}
              >
                <span className="w-7 shrink-0 font-num text-[14px] font-bold tabular-nums text-text-2">
                  {row.rank}
                </span>

                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 font-display text-[11px] font-bold uppercase"
                >
                  {row.username.slice(0, 2)}
                </span>

                <span className="flex-1 truncate text-[14px]">
                  {row.username}
                  {row.isYou ? <span className="ml-2 label text-accent">You</span> : null}
                </span>

                <span className="shrink-0 font-num text-[16px] font-bold tabular-nums">
                  {row.points}
                </span>
              </button>

              {open ? <Breakdown row={row} hasPrizes={hasPrizes} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Distance to the rows above and below — the "sort it out" strip from the design. */
function MyContext({ rows, you }: { rows: LeaderboardRow[]; you: LeaderboardRow }) {
  const index = rows.indexOf(you);
  const above = rows[index - 1];
  const below = rows[index + 1];

  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface px-5 py-4 shadow-el-1">
      <p className="label">Where you stand</p>
      <p className="text-[14px]">
        <span className="font-num font-bold tabular-nums">{you.rank}</span>
        {ordinalSuffix(you.rank)} on{' '}
        <span className="font-num font-bold tabular-nums">{you.points}</span> pts.
      </p>
      {above ? (
        <p className="text-[13px] text-text-2">
          <span className="font-num tabular-nums">{above.points - you.points}</span> behind{' '}
          {above.username}. Sort it out.
        </p>
      ) : (
        <p className="text-[13px] text-text-2">Top of the pile. Enjoy it while it lasts.</p>
      )}
      {below ? (
        <p className="text-[13px] text-text-3">
          <span className="font-num tabular-nums">{you.points - below.points}</span> clear of{' '}
          {below.username}.
        </p>
      ) : null}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  outcome: 'Correct outcome',
  exact: 'Exact scoreline',
  goal_diff: 'Goal difference',
  total_goals: 'Total goals',
  team_goals: "A team's goals",
  btts: 'Both teams scored',
  first_team: 'First-goal team',
  first_scorer: 'First scorer',
};

function Breakdown({ row, hasPrizes }: { row: LeaderboardRow; hasPrizes: boolean }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 pl-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-baseline justify-between gap-2">
            <dt className="text-[12.5px] text-text-3">{label}</dt>
            <dd className="font-num text-[12.5px] tabular-nums">{row.hits[key as never] ?? 0}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[12.5px] text-text-3">
        <span className="font-num tabular-nums">{row.submissions}</span> fixtures entered ·{' '}
        <span className="font-num tabular-nums">{row.accuracy}</span>% outcomes right
      </p>
      {/* Money only exists for leagues that have a prize scheme. */}
      {hasPrizes ? (
        <p className="text-[12.5px] text-prize">Prize ledger lands with the prize engine.</p>
      ) : null}
    </div>
  );
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}
