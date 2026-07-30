'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  type SquadPlayer,
  loadFixtureSquads,
} from '../../app/(app)/predict/actions';

/**
 * First-scorer picker: search both squads, pick one player.
 *
 * First scorer is the heaviest market in the rule set (weight 4), and until the season
 * bootstrap existed there was nothing to pick from — the sheet showed a note saying so.
 * There are now 564 real players, so this is the control that market was always meant to
 * have.
 *
 * Squads load when the picker is first opened, not with the board: a matchweek is ten
 * fixtures and shipping every squad up front would put ~560 players on the wire to fill a
 * control most people open a few times. Results are cached per fixture for the session.
 *
 * Search matches both name forms. The provider gives "Raya" and "David Raya Martín", and
 * someone typing either has to find him — matching only the display name makes half the
 * squad unfindable by surname.
 */
export function SquadSearch({
  fixtureId,
  homeName,
  awayName,
  selectedPlayerId,
  disabled,
  onSelect,
}: {
  fixtureId: string;
  homeName: string;
  awayName: string;
  selectedPlayerId: string | null;
  disabled?: boolean;
  onSelect: (playerId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [squads, setSquads] = useState<{ home: SquadPlayer[]; away: SquadPlayer[] } | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // The in-flight guard is a ref, not state, on purpose. Holding it in `state` puts it in
  // this effect's dependency array, so setting it to 'loading' re-runs the effect, whose
  // cleanup cancels the request that was already in flight — and the re-run then sees
  // 'loading' and returns early. The result: a picker permanently showing "Loading
  // squads…" having quietly abandoned its only request.
  const requested = useRef<string | null>(null);

  const load = useCallback(() => {
    requested.current = fixtureId;
    setState('loading');

    loadFixtureSquads(fixtureId)
      .then((result) => {
        // A different fixture's sheet was opened while this was in flight.
        if (requested.current !== fixtureId) return;
        if ('error' in result) {
          setState('error');
          return;
        }
        setSquads(result);
        setState('idle');
      })
      .catch(() => {
        // Without this a rejected action leaves the spinner up forever, which looks
        // identical to a slow network and gives the user nothing to act on.
        if (requested.current === fixtureId) setState('error');
      });
  }, [fixtureId]);

  useEffect(() => {
    if (!open || squads || requested.current === fixtureId) return;
    load();
  }, [open, fixtureId, squads, load]);

  // Focus the field once the panel is open, so the control is usable from the keyboard
  // without a second tab.
  useEffect(() => {
    if (open && squads) inputRef.current?.focus();
  }, [open, squads]);

  const all = useMemo(() => [...(squads?.home ?? []), ...(squads?.away ?? [])], [squads]);
  const selected = all.find((p) => p.id === selectedPlayerId) ?? null;

  const filter = (players: SquadPlayer[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) =>
        p.knownAs.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        String(p.shirtNumber ?? '').startsWith(q),
    );
  };

  // Picking closes the panel. Leaving it open after a choice means the confirmation chip
  // never appears — the list just sits there with a highlighted row, which reads as though
  // the tap did nothing.
  const choose = (playerId: string) => {
    setOpen(false);
    setQuery('');
    onSelect(playerId);
  };

  const home = filter(squads?.home ?? []);
  const away = filter(squads?.away ?? []);
  const empty = squads != null && home.length === 0 && away.length === 0;

  if (selected && !open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-11 items-center gap-2 rounded-md border border-accent bg-accent-weak px-3 text-[14px] text-text">
          <span className="font-medium">{selected.knownAs}</span>
          {selected.position ? (
            <span className="text-[12px] text-text-3">{selected.position}</span>
          ) : null}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect(null)}
          className="min-h-11 rounded-md border border-line px-3 text-[13px] text-text-2 transition-colors hover:border-line-2 hover:text-text disabled:opacity-50"
        >
          Change
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-md border border-line px-3 text-left text-[14px] text-text-2 transition-colors hover:border-line-2 hover:text-text disabled:opacity-50"
      >
        Search for a player…
      </button>
    );
  }

  return (
    <div
      className="flex flex-col gap-2"
      data-testid="squad-panel"
      data-open={String(open)}
      data-selected={selectedPlayerId ?? 'none'}
      data-fixture={fixtureId}
    >
      <input
        ref={inputRef}
        type="search"
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Name or shirt number"
        aria-label="Search players"
        aria-controls={listId}
        className="min-h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-[14px] text-text placeholder:text-text-3 focus:border-accent focus:outline-none"
      />

      {state === 'loading' ? (
        <p className="py-2 text-[13px] text-text-3" role="status">
          Loading squads…
        </p>
      ) : null}

      {state === 'error' ? (
        <p className="py-2 text-[13px] text-danger" role="alert">
          Could not load the squads.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              requested.current = null;
              setSquads(null);
              setState('idle');
            }}
          >
            Try again
          </button>
        </p>
      ) : null}

      {empty ? (
        <p className="py-2 text-[13px] text-text-3">No player matches “{query}”.</p>
      ) : null}

      <div
        id={listId}
        // Capped and scrollable: a full squad list would push the rest of the sheet off
        // screen on a phone, which is where most of these are filled in.
        className="max-h-64 overflow-y-auto"
      >
        <Group label={homeName} players={home} selectedId={selectedPlayerId} onSelect={choose} />
        <Group label={awayName} players={away} selectedId={selectedPlayerId} onSelect={choose} />
      </div>

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="min-h-11 self-start rounded-md border border-line px-3 text-[13px] text-text-2 transition-colors hover:border-line-2 hover:text-text"
      >
        Cancel
      </button>
    </div>
  );
}

function Group({
  label,
  players,
  selectedId,
  onSelect,
}: {
  label: string;
  players: SquadPlayer[];
  selectedId: string | null;
  onSelect: (playerId: string) => void;
}) {
  if (players.length === 0) return null;

  return (
    <div className="pb-2">
      <p className="label sticky top-0 bg-surface py-1 text-text-3">{label}</p>
      <ul className="flex flex-col">
        {players.map((player) => (
          <li key={player.id}>
            <button
              type="button"
              onClick={() => onSelect(player.id)}
              aria-pressed={player.id === selectedId}
              className={`flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-surface-2 ${
                player.id === selectedId ? 'bg-accent-weak' : ''
              }`}
            >
              <span className="num w-7 shrink-0 text-[13px] tabular-nums text-text-3">
                {player.shirtNumber ?? '—'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-text">{player.knownAs}</span>
                {player.name !== player.knownAs ? (
                  <span className="block truncate text-[12px] text-text-3">{player.name}</span>
                ) : null}
              </span>
              {player.position ? (
                <span className="shrink-0 text-[12px] text-text-3">
                  {player.position.slice(0, 3).toUpperCase()}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
