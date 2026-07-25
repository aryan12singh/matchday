'use client';

import { useState } from 'react';

import type { LeaderboardRow as ScoredRow } from '@matchday/scoring';

import { LeaderboardRow } from '../../../../../components/match/LeaderboardRow';

/**
 * A board row plus the prize amount, which the scoring package has no business knowing
 * about — money is a league concern, settled separately by the prize engine.
 */
type Row = ScoredRow & { prizeAmount?: string };

/**
 * Standings — design/screens/Leaderboard v2.
 *
 * Rows expand in place rather than linking away, because the question a leaderboard
 * provokes is "how did they get that?" and the answer should not cost a navigation.
 *
 * `hasPrizes` gates every money-bearing element. A points-only league renders no money
 * column at all — not a zeroed one (design/README.md rule 6).
 */
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

/** Which category first separates two users level on points. */
function decidingTiebreak(row: Row, other: Row | undefined): string | undefined {
  if (!other || other.points !== row.points) return undefined;

  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    const mine = row.hits[key as keyof typeof row.hits] ?? 0;
    const theirs = other.hits[key as keyof typeof other.hits] ?? 0;
    if (mine !== theirs) {
      return `${label.toLowerCase()} decided it (${mine} v ${theirs})`;
    }
  }

  if (row.submissions !== other.submissions) {
    return `fixtures entered decided it (${row.submissions} v ${other.submissions})`;
  }
  return 'still level — rank is shared';
}

export function LeaderboardTable({
  rows,
  hasPrizes,
  movement = {},
}: {
  rows: Row[];
  hasPrizes: boolean;
  /** Places gained or lost since the last snapshot, keyed by user id. */
  movement?: Record<string, number>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const you = rows.find((row) => row.isYou);

  return (
    <div className="flex flex-col gap-5">
      {you ? <MyContext rows={rows} you={you} /> : null}

      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row, index) => (
          <li key={row.userId}>
            <LeaderboardRow
              rank={row.rank}
              name={row.username}
              avatar={row.username.slice(0, 2)}
              points={row.points}
              movement={movement[row.userId] ?? 0}
              isMe={row.isYou}
              expanded={expanded === row.userId}
              onToggle={() => setExpanded(expanded === row.userId ? null : row.userId)}
              breakdown={Object.fromEntries([
                ...Object.entries(CATEGORY_LABELS).map(([key, label]) => [
                  label,
                  row.hits[key as keyof typeof row.hits] ?? 0,
                ]),
                ['Fixtures entered', row.submissions],
                ['Outcomes right', `${row.accuracy}%`],
              ])}
              {...(decidingTiebreak(row, rows[index - 1] ?? rows[index + 1])
                ? { tiebreak: decidingTiebreak(row, rows[index - 1] ?? rows[index + 1])! }
                : {})}
              // `prize` stays unset until the prize engine computes settlements. Passing
              // it is the only change needed then — LeaderboardRow already routes it
              // through PrizeTag, which is where the points-only gate lives.
              {...(hasPrizes && row.prizeAmount ? { prize: row.prizeAmount } : {})}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Distance to the rows above and below — the "sort it out" strip from the design. */
function MyContext({ rows, you }: { rows: Row[]; you: Row }) {
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
