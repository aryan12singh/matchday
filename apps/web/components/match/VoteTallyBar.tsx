'use client';

/**
 * VoteTallyBar — fixture-vote toggle plus live tally (screen 21).
 *
 * Recreated from design/components/VoteTallyBar.{d.ts,prompt.md}.
 *
 * The bar is denominated by league size rather than by the leading fixture, so "5 of 7
 * members want this" reads honestly. Scaling to the maximum vote instead would make one
 * vote look like unanimity in a quiet round.
 *
 * Votes are advisory and identities are never shown — the count is all there is, and the
 * underlying table is not readable beyond one's own row.
 */
export interface VoteTallyBarProps {
  votes: number;
  /** League member count — the bar's denominator. */
  max: number;
  /** Whether the current user voted for it. */
  mine?: boolean;
  onToggle?: () => void;
  /** After finalization. */
  disabled?: boolean;
}

export function VoteTallyBar({
  votes,
  max,
  mine = false,
  onToggle,
  disabled = false,
}: VoteTallyBarProps) {
  const percent = max > 0 ? Math.min(100, Math.round((votes / max) * 100)) : 0;

  return (
    <span className="flex items-center gap-3">
      <span
        className="flex items-center gap-2"
        role="img"
        aria-label={`${votes} of ${max} members voted for this fixture`}
      >
        <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
          <span
            className="block h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </span>
        <span className="font-num text-[12px] font-semibold tabular-nums text-text-2">
          {votes}
        </span>
      </span>

      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-pressed={mine}
          className={`min-h-tap rounded-md px-4 font-display text-[11px] font-bold uppercase tracking-label disabled:opacity-40 ${
            // Volt marks the user's own action; aria-pressed carries it for anyone who
            // cannot see the fill.
            mine ? 'bg-accent text-on-accent' : 'bg-surface-2 text-text-2 hover:text-text'
          }`}
        >
          {mine ? 'Voted' : 'Vote'}
        </button>
      ) : null}
    </span>
  );
}
