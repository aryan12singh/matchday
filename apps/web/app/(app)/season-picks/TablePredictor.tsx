'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';

import { TeamChip } from '../../../components/match/TeamChip';
import { Button } from '../../../components/ui/Button';
import { ErrorState } from '../../../components/ui/EmptyState';
import { saveSeasonTable } from '../predict/actions';

export interface PredictorTeam {
  id: string;
  name: string;
  code: string | null;
}

/**
 * Screen 22 — season table predictor (addendum §C).
 *
 * Reordering is up/down buttons first and drag second. On a phone, dragging a row through
 * a 20-item list while the page scrolls is genuinely hard, and this is a once-a-season
 * entry that must not be fiddly. The buttons are also the accessible path: they are real
 * buttons with labels, and each move is announced.
 *
 * Autosaves as a draft on every change, like the predict screen. Hard lock at the
 * season's first kickoff (addendum §H.5) — after that this becomes the tracking view.
 */
export function TablePredictor({
  seasonId,
  teams,
  initialOrder,
  locked,
}: {
  seasonId: string;
  teams: PredictorTeam[];
  initialOrder: string[];
  locked: boolean;
}) {
  const byId = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const [order, setOrder] = useState<string[]>(() =>
    initialOrder.length === teams.length
      ? initialOrder
      : // Seeded with a sensible default rather than an empty list: an alphabetical 20 is
        // a worse prediction than last season's table, but it is a starting point that
        // does not demand 20 decisions before the first save.
        teams.map((t) => t.id),
  );
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState('');

  const persist = useCallback(
    (next: string[]) => {
      setSaveState('saving');
      startTransition(async () => {
        const result = await saveSeasonTable(seasonId, next);
        if (result.status === 'saved') {
          setSaveState('saved');
          setError(null);
        } else {
          setSaveState('idle');
          setError(result.message);
        }
      });
    },
    [seasonId],
  );

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;

    const next = [...order];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);

    setOrder(next);
    setAnnouncement(`${byId.get(moved!)?.name ?? 'Team'} moved to position ${target + 1}`);
    persist(next);
  };

  if (locked) {
    return (
      <p role="status" className="rounded-md bg-surface-2 px-4 py-3 text-[13px] text-text-2">
        The season has started — your table locked at the first kickoff. Track how it is
        doing on your league&apos;s Table race tab.
      </p>
    );
  }

  const matches = (name: string) =>
    search.trim() === '' || name.toLowerCase().includes(search.trim().toLowerCase());

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-md bg-surface-2 px-4 py-3 text-[13px] text-text-2">
        Rank all 20. You score the total number of places you are out across the table —{' '}
        <span className="text-text">lowest wins</span>. It is a separate competition from
        your weekly points.
      </p>

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Find a team"
        aria-label="Find a team"
        className="min-h-tap rounded-md bg-surface-2 px-4 shadow-el-1 placeholder:text-text-3"
      />

      {error ? <ErrorState title="Not saved" body={error} /> : null}

      {/* Move announcements for assistive tech — the visual reorder is not enough. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ol className="flex flex-col divide-y divide-border">
        {order.map((teamId, index) => {
          const team = byId.get(teamId);
          if (!team || !matches(team.name)) return null;

          return (
            <li key={teamId} className="flex min-h-tap items-center gap-3 py-2">
              <span className="w-7 shrink-0 font-num text-[14px] font-bold tabular-nums text-text-2">
                {index + 1}
              </span>
              <TeamChip code={team.code} name={team.name} size={24} />
              <span className="flex-1 truncate text-[14px]">{team.name}</span>

              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${team.name} up`}
                  className="flex min-h-tap min-w-tap items-center justify-center rounded-md bg-surface-2 text-text-2 hover:bg-surface-3 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === order.length - 1}
                  aria-label={`Move ${team.name} down`}
                  className="flex min-h-tap min-w-tap items-center justify-center rounded-md bg-surface-2 text-text-2 hover:bg-surface-3 disabled:opacity-30"
                >
                  ▼
                </button>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-text-3">
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'saved'
              ? '✓ Draft saved — editable until the first kickoff'
              : 'Draft saves automatically'}
        </span>
        <Button variant="secondary" onClick={() => persist(order)} loading={saveState === 'saving'}>
          Save now
        </Button>
      </div>
    </div>
  );
}
