import type { ReactNode } from 'react';

export type BadgeState = 'live' | 'locked' | 'settled' | 'void' | 'pending';

/**
 * Fixture/prediction state badge.
 *
 * Locked is grey, never red — red means "you lost points", and a locked fixture is not a
 * failure. Void is dashed. Live gets a pulsing dot, and the pulse is on the dot alone,
 * never the whole card; `prefers-reduced-motion` freezes it via globals.css.
 *
 * Every state carries a text label as well as its colour: state is never conveyed by
 * colour alone (design/README.md, Accessibility).
 */
const STYLES: Record<BadgeState, string> = {
  live: 'bg-live-dim text-live',
  locked: 'bg-locked-dim text-locked',
  settled: 'bg-success-dim text-success',
  void: 'border border-dashed border-void text-void opacity-[.55]',
  pending: 'bg-surface-3 text-text-2',
};

const DEFAULT_LABEL: Record<BadgeState, string> = {
  live: 'Live',
  locked: 'Locked',
  settled: 'Settled',
  void: 'Void',
  pending: 'Open',
};

export function StateBadge({ state, children }: { state: BadgeState; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-display text-[11px] font-bold uppercase tracking-label ${STYLES[state]}`}
    >
      {state === 'live' ? (
        <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-live" />
      ) : null}
      {state === 'locked' ? (
        <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 fill-current">
          <path d="M3 5V3.5a3 3 0 0 1 6 0V5h.5A1.5 1.5 0 0 1 11 6.5v3A1.5 1.5 0 0 1 9.5 11h-7A1.5 1.5 0 0 1 1 9.5v-3A1.5 1.5 0 0 1 2.5 5H3Zm1.5 0h3V3.5a1.5 1.5 0 0 0-3 0V5Z" />
        </svg>
      ) : null}
      {children ?? DEFAULT_LABEL[state]}
    </span>
  );
}
