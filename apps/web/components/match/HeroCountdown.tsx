'use client';

import { useEffect, useState } from 'react';

/**
 * The hero countdown — `--text-num-mega`, the signature element of Home v2.
 *
 * Distinct from CountdownChip, which is the small inline one on fixture cards. This is
 * the thing the screen is built around, so it renders at 72px (56px on a narrow phone)
 * with the day suffix and the seconds stepped down in size and colour, exactly as
 * design/screenshots/01-home-v2.png shows: the minutes are what you read, the seconds are
 * texture.
 *
 * Renders nothing on the server pass. A countdown painted from the server clock and then
 * corrected on hydration visibly jumps by the round-trip time, which on the largest
 * numerals on the page is impossible to miss.
 */
export function HeroCountdown({ target }: { target: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(new Date(target).getTime() - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  if (remaining == null) {
    // Reserves the line so the hero does not jump when the numbers arrive.
    return <p className="font-num text-[56px] leading-none tabular-nums text-text-3">·····</p>;
  }

  if (remaining <= 0) {
    return (
      <p className="font-display text-[28px] font-extrabold uppercase tracking-label text-locked">
        Locked
      </p>
    );
  }

  const total = Math.floor(remaining / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  const urgent = remaining < 60 * 60 * 1000;

  return (
    <p
      className={`flex items-baseline font-num font-bold leading-none tabular-nums ${
        // Coral inside the last hour: at that point the countdown is match urgency, not
        // neutral metadata.
        urgent ? 'text-live' : 'text-text'
      }`}
      aria-label={`Locks in ${days} days ${hours} hours ${minutes} minutes`}
    >
      {days > 0 ? (
        <>
          <span className="text-[56px] sm:text-[72px]">{days}</span>
          <span className="pr-3 text-[24px] text-text-3">d</span>
        </>
      ) : null}
      <span className="text-[56px] sm:text-[72px]">
        {pad(hours)}
        <span className="px-1 text-text-3">:</span>
        {pad(minutes)}
      </span>
      <span className="text-[24px] text-text-3">
        <span className="px-0.5">:</span>
        {pad(seconds)}
      </span>
    </p>
  );
}
