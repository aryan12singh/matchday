/**
 * CountsBadge — which of the viewer's leagues count this fixture.
 *
 * Recreated from design/components/CountsBadge.{d.ts,prompt.md}. Predicting a fixture no
 * league selected is allowed and scores nowhere ("just for fun", addendum §B), so the
 * not-selected case is stated rather than left blank — silence would read as a bug.
 */
export interface CountsBadgeProps {
  /** League names that count this fixture. */
  countsIn: readonly string[];
  /** League names that explicitly did not select it. */
  notIn?: readonly string[];
}

export function CountsBadge({ countsIn, notIn = [] }: CountsBadgeProps) {
  if (countsIn.length === 0) {
    return (
      <span
        className="label text-text-3"
        title={
          notIn.length > 0
            ? `Not selected for ${notIn.join(', ')}`
            : 'No league counts this fixture'
        }
      >
        Not selected
      </span>
    );
  }

  return (
    <span className="label text-text-3" title={`Counts in ${countsIn.join(', ')}`}>
      {countsIn.length === 1 ? `In ${countsIn[0]}` : `In ${countsIn.length} leagues`}
    </span>
  );
}
