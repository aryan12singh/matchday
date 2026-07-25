'use client';

import { useState, useTransition } from 'react';

import { saveGoldenBoot } from '../predict/actions';

/**
 * Golden Boot entry (addendum §C). Locks with the table, at the season's first kickoff.
 *
 * The squad-search picker needs squads, which arrive with the season bootstrap. Until
 * then this says so plainly rather than rendering an empty search that looks broken.
 */
export function GoldenBootPicker({
  seasonId,
  locked,
  players = [],
}: {
  seasonId: string;
  locked: boolean;
  players?: Array<{ id: string; name: string; teamName: string }>;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (locked) {
    return (
      <p role="status" className="text-[13px] text-text-2">
        Locked at the first kickoff. Settles from the provider&apos;s top scorers at season
        end.
      </p>
    );
  }

  if (players.length === 0) {
    return (
      <p className="text-[13px] text-text-3">
        Squads arrive with the season import. Your pick opens here once they do.
      </p>
    );
  }

  const matches = players.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const choose = (playerId: string) => {
    setPicked(playerId);
    startTransition(async () => {
      const result = await saveGoldenBoot(seasonId, playerId);
      setMessage(result.status === 'saved' ? '✓ Saved' : result.message);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search players"
        aria-label="Search players"
        className="min-h-tap rounded-md bg-surface-2 px-4 shadow-el-1 placeholder:text-text-3"
      />

      <ul className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto">
        {matches.slice(0, 40).map((player) => (
          <li key={player.id}>
            <button
              type="button"
              onClick={() => choose(player.id)}
              aria-pressed={picked === player.id}
              disabled={pending}
              className={`flex min-h-tap w-full items-center justify-between gap-3 px-1 text-left text-[14px] ${
                picked === player.id ? 'text-accent' : ''
              }`}
            >
              <span className="truncate">{player.name}</span>
              <span className="shrink-0 text-[12.5px] text-text-3">{player.teamName}</span>
            </button>
          </li>
        ))}
      </ul>

      {message ? (
        <p role="status" className="text-[12.5px] text-text-2">
          {message}
        </p>
      ) : null}
    </div>
  );
}
