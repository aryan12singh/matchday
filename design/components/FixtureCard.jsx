// Fixture prediction card — the core Predict surface (screen 4).
// States: editable (pre-KO), locked, live (provisional pts), settled, void.
export function FixtureCard({ home, away, kickoff, state = 'editable', homeScore, awayScore,
  actualHome, actualAway, minute, points, countsIn, notIn, saved, onScore, onExpand }) {
  const Chip = ({ code }) => <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-3)', border: '1px solid var(--border-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '700 10px var(--font-display)', color: 'var(--text-2)' }}>{code}</span>;
  const Stepper = ({ v, side }) => state === 'editable'
    ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onScore && onScore(side, -1)} style={btn}>−</button>
        <span style={{ minWidth: 28, textAlign: 'center', font: 'var(--text-num-lg)', fontVariantNumeric: 'tabular-nums', color: v == null ? 'var(--text-3)' : 'var(--text)' }}>{v == null ? '–' : v}</span>
        <button onClick={() => onScore && onScore(side, 1)} style={btn}>+</button>
      </div>
    : <span style={{ minWidth: 28, textAlign: 'center', font: 'var(--text-num-lg)', fontVariantNumeric: 'tabular-nums', color: state === 'void' ? 'var(--void)' : 'var(--text)' }}>{v == null ? '–' : v}</span>;
  const btn = { width: 44, height: 44, borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text)', font: '700 18px var(--font-display)', cursor: 'pointer' };
  const leftEdge = state === 'live' ? 'var(--live)' : state === 'editable' && homeScore == null ? 'var(--accent)' : 'transparent';
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${leftEdge}`, borderRadius: 'var(--r-md)', padding: 16, opacity: state === 'void' ? 0.6 : 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* header: kickoff/state + badges — see StateBadge, CountsBadge */}
      {/* body: TeamChip + name | steppers or picked score | live actual score + minute */}
      {/* footer: advanced-markets summary chips + expand → bottom sheet (mobile) */}
    </div>
  );
}