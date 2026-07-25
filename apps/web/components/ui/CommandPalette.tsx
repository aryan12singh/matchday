'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * ⌘K command palette (design/README.md, Interactions).
 *
 * Navigation only, deliberately. A palette that can *do* things — finalise a round, save a
 * prediction — is a palette that can do them by accident from a fuzzy match, and every
 * one of those actions has a deadline or an audit trail attached. Going somewhere is
 * always safe.
 *
 * Built rather than pulled in: it is a filtered list and a keydown handler, and cmdk plus
 * its peer deps is more surface area than the feature.
 */

export interface Command {
  id: string;
  label: string;
  hint?: string;
  href: string;
}

export function CommandPalette({
  open,
  onClose,
  leagues,
}: {
  open: boolean;
  onClose: () => void;
  leagues: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const commands = useMemo<Command[]>(
    () => [
      { id: 'home', label: 'Home', hint: 'Matchweek hub', href: '/home' },
      { id: 'predict', label: 'Predict', hint: 'This matchweek', href: '/predict' },
      { id: 'live', label: 'Live', hint: "What's on now", href: '/live' },
      { id: 'table', label: 'Season table', hint: 'Your 20-team prediction', href: '/table' },
      { id: 'leagues', label: 'Leagues', hint: 'All your leagues', href: '/leagues' },
      { id: 'new-league', label: 'Create a league', href: '/leagues/new' },
      { id: 'join', label: 'Join a league', hint: 'With a code', href: '/join' },
      ...leagues.flatMap((league) => [
        { id: `l-${league.id}`, label: league.name, hint: 'League home', href: `/leagues/${league.id}` },
        {
          id: `lb-${league.id}`,
          label: `${league.name} leaderboard`,
          hint: 'Standings',
          href: `/leagues/${league.id}/leaderboard`,
        },
      ]),
    ],
    [leagues],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 8);
    // Subsequence match, so "lbo" finds "Leaderboard" — the point of a palette is that
    // you type roughly what you mean.
    return commands
      .filter((command) => {
        const haystack = `${command.label} ${command.hint ?? ''}`.toLowerCase();
        let i = 0;
        for (const char of q) {
          i = haystack.indexOf(char, i);
          if (i === -1) return false;
          i += 1;
        }
        return true;
      })
      .slice(0, 10);
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus after paint, or the dialog is not yet in the accessibility tree.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const go = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    router.push(command.href);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      style={{ background: 'var(--overlay)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-lg bg-surface shadow-el-3"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') return onClose();
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((i) => Math.min(results.length - 1, i + 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              go(results[active]);
            }
          }}
          placeholder="Go to…"
          aria-label="Search commands"
          aria-controls="palette-results"
          aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
          className="w-full bg-transparent px-5 py-4 text-[16px] outline-none placeholder:text-text-3"
        />

        <ul
          id="palette-results"
          ref={listRef}
          role="listbox"
          aria-label="Results"
          className="max-h-[50vh] overflow-y-auto border-t border-border"
        >
          {results.length === 0 ? (
            <li className="px-5 py-4 text-[13px] text-text-3">Nothing matches that.</li>
          ) : (
            results.map((command, index) => (
              <li key={command.id} id={`cmd-${command.id}`} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(command)}
                  className={`flex min-h-tap w-full items-baseline gap-3 px-5 text-left ${
                    index === active ? 'bg-surface-2' : ''
                  }`}
                >
                  <span className="text-[14px]">{command.label}</span>
                  {command.hint ? (
                    <span className="text-[12.5px] text-text-3">{command.hint}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>

        <p className="border-t border-border px-5 py-2 text-[12px] text-text-3">
          <kbd className="font-num">↑↓</kbd> move · <kbd className="font-num">↵</kbd> go ·{' '}
          <kbd className="font-num">esc</kbd> close
        </p>
      </div>
    </div>
  );
}
