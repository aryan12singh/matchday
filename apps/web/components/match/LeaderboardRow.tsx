'use client';

import { CountUp } from '../ui/CountUp';
import { PrizeTag } from './PrizeTag';

/**
 * LeaderboardRow — rank · avatar · name · [prize] · movement · points (screens 9/10).
 *
 * Recreated from design/components/LeaderboardRow.{d.ts,prompt.md}.
 *
 * Movement arrows carry a sign and a label as well as a colour, because "up two" and
 * "down two" must not be distinguishable only by green versus red. The prize column
 * renders only when the league has a prize scheme — it is a PrizeTag with `hidden`, so
 * there is exactly one place that rule lives.
 *
 * Tied points show the deciding tiebreak in the expansion. With a nine-step chain a true
 * tie is rare, but when it happens the losing side deserves to know which category
 * decided it rather than assuming the sort is arbitrary.
 */
export interface LeaderboardRowProps {
  rank: number;
  name: string;
  /** Two-letter initials — a neutral monogram, never an uploaded image. */
  avatar: string;
  points: number;
  /** Versus the last matchweek: positive up, negative down, 0 flat. */
  movement?: number;
  isMe?: boolean;
  breakdown?: Record<string, number | string>;
  /** Preformatted, e.g. "+£15". Only ever passed when a prize scheme exists. */
  prize?: string;
  expanded?: boolean;
  onToggle?: () => void;
  /** Deciding tiebreak text, shown in the expansion when points are level. */
  tiebreak?: string;
}

export function LeaderboardRow({
  rank,
  name,
  avatar,
  points,
  movement = 0,
  isMe = false,
  breakdown,
  prize,
  expanded = false,
  onToggle,
  tiebreak,
}: LeaderboardRowProps) {
  return (
    <div className={isMe ? 'bg-accent-dim' : ''}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={onToggle ? expanded : undefined}
        className={`flex min-h-tap w-full items-center gap-3 py-3 pl-3 pr-1 text-left ${
          // A rail as well as the wash, so "this is me" survives a colourblind reading.
          isMe ? 'border-l-[3px] border-accent' : ''
        }`}
      >
        <span
          className={`w-7 shrink-0 font-num text-[14px] font-bold tabular-nums ${
            // Top three get full text colour; everyone else is secondary.
            rank <= 3 ? 'text-text' : 'text-text-2'
          }`}
        >
          {rank}
        </span>

        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 font-display text-[11px] font-bold uppercase"
        >
          {avatar}
        </span>

        <span className="flex-1 truncate text-[14px]">
          {name}
          {isMe ? <span className="ml-2 label text-accent">You</span> : null}
        </span>

        {prize ? <PrizeTag amount={prize} /> : null}

        <Movement value={movement} />

        <span className="shrink-0 font-num text-[16px] font-bold tabular-nums">
          <CountUp value={points} />
        </span>
      </button>

      {expanded ? (
        <div className="flex flex-col gap-2 border-t border-border px-3 py-3">
          {breakdown ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(breakdown).map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-2">
                  <dt className="text-[12.5px] text-text-3">{label}</dt>
                  <dd className="font-num text-[12.5px] tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {tiebreak ? (
            <p className="text-[12.5px] text-text-3">Level on points — {tiebreak}.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Movement({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="w-8 shrink-0 text-center text-[12px] text-text-3" aria-label="No change">
        —
      </span>
    );
  }

  const up = value > 0;

  return (
    <span
      className={`flex w-8 shrink-0 items-center justify-end gap-0.5 text-[12px] ${
        up ? 'text-success' : 'text-danger'
      }`}
      aria-label={`${up ? 'Up' : 'Down'} ${Math.abs(value)} ${Math.abs(value) === 1 ? 'place' : 'places'}`}
    >
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span aria-hidden="true" className="font-num tabular-nums">
        {Math.abs(value)}
      </span>
    </span>
  );
}
