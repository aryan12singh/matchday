'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Count-up for point totals.
 *
 * Renders the final value immediately under `prefers-reduced-motion` — that is a design
 * rule, not an optimisation, and doing it by checking the media query rather than by
 * relying on the CSS duration override means the intermediate numbers are never painted
 * at all for someone who asked not to see them.
 *
 * Server-renders the final value too, so the number is correct before hydration and never
 * flashes zero.
 */
export function CountUp({
  value,
  durationMs = 600,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;

    if (from === value) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setDisplay(value);
      return;
    }

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // Ease-out: the number should land, not coast.
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return (
    <span className={className} aria-label={String(value)}>
      {display}
    </span>
  );
}
