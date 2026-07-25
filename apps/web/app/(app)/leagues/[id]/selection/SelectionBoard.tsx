'use client';

import { useMemo, useState, useTransition } from 'react';

import { CountdownChip } from '../../../../../components/match/CountdownChip';
import { TeamChip } from '../../../../../components/match/TeamChip';
import { Button } from '../../../../../components/ui/Button';
import { EmptyState, ErrorState } from '../../../../../components/ui/EmptyState';
import { finalizeSelection, toggleVote } from './actions';

export interface SelectionFixture {
  fixtureId: string;
  kickoffAt: string;
  homeName: string;
  awayName: string;
  homeCode: string | null;
  awayCode: string | null;
  votes: number;
  votedByMe: boolean;
  selected: boolean;
}

/**
 * Screen 21 — round selection and voting (addendum §E).
 *
 * Two views of one list. A member toggles votes and watches the tally; an organizer
 * ticks the fixtures that will actually count and finalizes. The copy is explicit that
 * votes are advisory, because a member who thinks their vote is binding and then sees a
 * different selection will read it as a bug rather than a decision.
 *
 * Tallies show counts only, never who voted (addendum §H.2) — the underlying table is
 * not readable, so there is nothing to leak even by accident.
 */
export function SelectionBoard({
  leagueSeasonId,
  roundId,
  roundName,
  fixtures,
  isOrganizer,
  mode,
  finalized,
}: {
  leagueSeasonId: string;
  roundId: string;
  roundName: string;
  fixtures: SelectionFixture[];
  isOrganizer: boolean;
  mode: 'admin_pick' | 'vote';
  finalized: boolean;
}) {
  const [rows, setRows] = useState(fixtures);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(fixtures.filter((f) => f.selected).map((f) => f.fixtureId)),
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const firstKickoff = useMemo(
    () => rows.map((r) => r.kickoffAt).sort()[0] ?? null,
    [rows],
  );

  const canVote = mode === 'vote' && !finalized;

  const onToggleVote = (fixtureId: string) => {
    // Optimistic: the tally is the whole feedback loop, so it has to move on tap.
    setRows((current) =>
      current.map((row) =>
        row.fixtureId === fixtureId
          ? {
              ...row,
              votedByMe: !row.votedByMe,
              votes: row.votes + (row.votedByMe ? -1 : 1),
            }
          : row,
      ),
    );

    startTransition(async () => {
      const result = await toggleVote(leagueSeasonId, roundId, fixtureId);
      if (result.status === 'error') {
        setRows(fixtures);
        setError(result.message);
      }
    });
  };

  const onFinalize = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await finalizeSelection(leagueSeasonId, roundId, [...picked]);
      if (result.status === 'error') setError(result.message);
      else setNotice(`${result.count} ${result.count === 1 ? 'fixture' : 'fixtures'} will count.`);
    });
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No fixtures in this round yet."
        body="Voting opens once the round's fixtures are confirmed."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="label">{roundName}</p>
        {firstKickoff ? <CountdownChip target={firstKickoff} label="First kickoff" /> : null}
      </div>

      {finalized ? (
        <p role="status" className="rounded-md bg-surface-2 px-4 py-3 text-[13px] text-text-2">
          Selection is final for this round.
          {mode === 'vote' ? ' Voting is closed.' : ''}
        </p>
      ) : mode === 'vote' ? (
        <p className="rounded-md bg-surface-2 px-4 py-3 text-[13px] text-text-2">
          Vote for the matches you want to count. Votes are advisory — the organizer
          finalises the selection.
        </p>
      ) : null}

      {error ? <ErrorState title="That didn't work" body={error} /> : null}
      {notice ? (
        <p role="status" className="rounded-md bg-success-dim px-4 py-3 text-[13px] text-success">
          {notice}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const isPicked = picked.has(row.fixtureId);

          return (
            <li
              key={row.fixtureId}
              className={`flex flex-col gap-3 rounded-md bg-surface px-4 py-3 shadow-el-1 ${
                row.selected ? 'border-l-[3px] border-accent' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <TeamChip code={row.homeCode} name={row.homeName} size={24} />
                <span className="flex-1 truncate text-[14px]">
                  {row.homeName} v {row.awayName}
                </span>
                <TeamChip code={row.awayCode} name={row.awayName} size={24} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-num text-[12px] tabular-nums text-text-3">
                  {new Date(row.kickoffAt).toLocaleString(undefined, {
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>

                <span className="flex items-center gap-3">
                  <VoteTally votes={row.votes} total={Math.max(...rows.map((r) => r.votes), 1)} />

                  {canVote ? (
                    <button
                      type="button"
                      onClick={() => onToggleVote(row.fixtureId)}
                      aria-pressed={row.votedByMe}
                      disabled={pending}
                      className={`min-h-tap rounded-md px-4 font-display text-[11px] font-bold uppercase tracking-label ${
                        row.votedByMe
                          ? 'bg-accent text-on-accent'
                          : 'bg-surface-2 text-text-2 hover:text-text'
                      }`}
                    >
                      {row.votedByMe ? 'Voted' : 'Vote'}
                    </button>
                  ) : null}

                  {isOrganizer && !finalized ? (
                    <label className="flex min-h-tap cursor-pointer items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={isPicked}
                        onChange={() =>
                          setPicked((current) => {
                            const next = new Set(current);
                            if (next.has(row.fixtureId)) next.delete(row.fixtureId);
                            else next.add(row.fixtureId);
                            return next;
                          })
                        }
                        className="size-5 accent-[var(--accent)]"
                      />
                      Counts
                    </label>
                  ) : null}

                  {row.selected ? <span className="label text-accent">Counts</span> : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {isOrganizer && !finalized ? (
        <div className="flex flex-col gap-2">
          <Button onClick={onFinalize} loading={pending} disabled={picked.size === 0}>
            Finalise {picked.size} {picked.size === 1 ? 'fixture' : 'fixtures'}
          </Button>
          <p className="text-[12.5px] text-text-3">
            {picked.size === 0
              ? 'Pick at least one fixture — a round can never count nothing.'
              : 'You can change this until the first selected kickoff. If you never finalise, every fixture counts.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Horizontal tally bar. The number is the truth; the bar is the glance. */
function VoteTally({ votes, total }: { votes: number; total: number }) {
  return (
    <span className="flex items-center gap-2" title={`${votes} votes`}>
      <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
        <span
          className="block h-full rounded-full bg-accent"
          style={{ width: `${Math.round((votes / total) * 100)}%` }}
        />
      </span>
      <span className="font-num text-[12px] font-semibold tabular-nums text-text-2">{votes}</span>
    </span>
  );
}
