/**
 * PrizeTag — money display. Gold, matter-of-fact, and hideable.
 *
 * Recreated from design/components/PrizeTag.{d.ts,prompt.md}.
 *
 * The `hidden` prop returns null rather than rendering a dimmed or zeroed tag. That is the
 * whole point of design/README.md rule 6: a points-only league shows no money UI anywhere,
 * and a greyed-out "£0" is still money UI. Callers pass
 * `hidden={league.prizeSchemeId == null}`.
 *
 * `amount` is preformatted by the caller because currency_label is a per-league display
 * string — the app never moves money, it keeps a ledger among friends, and it has no
 * business guessing a locale.
 */
export interface PrizeTagProps {
  /** Preformatted, e.g. "£120" or "+£15". */
  amount: string;
  label?: string;
  /** True when the league has no prize scheme — renders nothing at all. */
  hidden?: boolean;
}

export function PrizeTag({ amount, label, hidden = false }: PrizeTagProps) {
  if (hidden) return null;

  return (
    <span className="inline-flex items-baseline gap-1.5">
      {label ? <span className="label text-text-3">{label}</span> : null}
      <span className="font-num text-[13px] font-semibold tabular-nums text-prize">{amount}</span>
    </span>
  );
}
