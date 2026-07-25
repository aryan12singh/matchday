'use client';

/**
 * 44px score stepper — one per team on the fixture card.
 *
 * `null` renders an em dash, not a zero: "I haven't predicted" and "I predicted nil" are
 * different claims, and showing 0 for the first would silently turn every untouched
 * fixture into a 0-0 prediction.
 *
 * Keyboard: the buttons are real buttons, and the readout is an aria-live region so a
 * screen reader announces the new value rather than only the button that was pressed.
 */
export function ScoreStepper({
  value,
  label,
  disabled = false,
  onChange,
}: {
  value: number | null;
  /** Announced to assistive tech, e.g. "Arsenal goals". */
  label: string;
  disabled?: boolean;
  onChange?: (next: number) => void;
}) {
  const bump = (delta: 1 | -1) => {
    const base = value ?? 0;
    const next = Math.max(0, Math.min(99, base + delta));
    onChange?.(next);
  };

  if (disabled) {
    return (
      <span
        className="inline-flex min-h-tap min-w-tap items-center justify-center font-num text-[24px] font-bold tabular-nums"
        aria-label={`${label}: ${value ?? 'no prediction'}`}
      >
        {value ?? '–'}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => bump(-1)}
        disabled={(value ?? 0) <= 0}
        aria-label={`Decrease ${label}`}
        className="flex min-h-tap min-w-tap items-center justify-center rounded-md bg-surface-2 font-display text-[18px] leading-none text-text-2 hover:bg-surface-3 disabled:opacity-30"
      >
        −
      </button>

      <output
        aria-live="polite"
        aria-label={label}
        className="min-w-[2ch] text-center font-num text-[24px] font-bold tabular-nums"
      >
        {value ?? '–'}
      </output>

      <button
        type="button"
        onClick={() => bump(1)}
        aria-label={`Increase ${label}`}
        // Volt: this is the user's action. Coral would mean match state.
        className="flex min-h-tap min-w-tap items-center justify-center rounded-md bg-accent-dim font-display text-[18px] leading-none text-accent hover:bg-surface-3"
      >
        +
      </button>
    </span>
  );
}
