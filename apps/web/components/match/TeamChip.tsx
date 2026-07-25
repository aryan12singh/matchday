/**
 * Neutral team monogram — the legal-safe stand-in for club crests.
 *
 * design/README.md rule 7: NEVER club crests, club colours or competition marks. The
 * background is always --surface-3, whatever the club. This is a licensing constraint,
 * not a style preference, so there is no `color` prop to tempt anyone.
 */
export function TeamChip({
  code,
  name,
  size = 28,
}: {
  code: string | null;
  name: string;
  size?: number;
}) {
  // Falls back to the first letters of the name when the provider has no short code.
  const monogram = (code ?? name.replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase().slice(0, 3);

  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-display text-[11px] font-extrabold uppercase tracking-tight text-text-2"
    >
      {monogram}
    </span>
  );
}
