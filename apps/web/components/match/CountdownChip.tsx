'use client';

import { useEffect, useState } from 'react';

/**
 * Countdown to lock. Flips to coral inside the last hour, because at that point the
 * countdown IS match urgency rather than a neutral piece of metadata.
 *
 * Rendered client-side from a server-provided ISO timestamp: the *authority* on whether
 * something is locked is the database, and this only ever displays time remaining. When
 * it reaches zero it says "Locked" and stops — it never re-enables an input.
 */
export function CountdownChip({ target, label = 'Locks in' }: { target: string; label?: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(new Date(target).getTime() - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  // Nothing on the server pass: a countdown rendered from the server clock and then
  // corrected on hydration flickers by exactly the round trip time.
  if (remaining == null) {
    return <span className="font-num text-[12px] tabular-nums text-text-3">·····</span>;
  }

  if (remaining <= 0) {
    return (
      <span className="font-display text-[11px] font-bold uppercase tracking-label text-locked">
        Locked
      </span>
    );
  }

  const urgent = remaining < 60 * 60 * 1000;

  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-display text-[11px] font-bold uppercase tracking-label text-text-3">
        {label}
      </span>
      <span
        className={`font-num text-[12px] font-semibold tabular-nums ${urgent ? 'text-live' : 'text-text-2'}`}
      >
        {format(remaining)}
      </span>
    </span>
  );
}

function format(ms: number): string {
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return days > 0
    ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
