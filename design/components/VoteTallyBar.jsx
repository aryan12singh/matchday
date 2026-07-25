export function VoteTallyBar({ votes, max, mine, onToggle, disabled }) {
  const pct = max > 0 ? Math.round((votes / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 'var(--tap-min)' }}>
      <button disabled={disabled} onClick={onToggle} aria-pressed={mine}
        style={{ width: 44, height: 32, borderRadius: 'var(--r-sm)', cursor: disabled ? 'default' : 'pointer',
          border: `1px solid ${mine ? 'var(--accent)' : 'var(--border-strong)'}`,
          background: mine ? 'var(--accent)' : 'var(--surface-2)', color: mine ? 'var(--on-accent)' : 'var(--text-3)',
          font: '800 12px var(--font-display)' }}>{mine ? 'IN' : 'VOTE'}</button>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', borderRadius: 4,
          background: mine ? 'var(--accent)' : 'var(--text-3)', transition: 'width .25s' }} />
      </div>
      <span style={{ font: 'var(--text-num-sm)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)', width: 34, textAlign: 'right' }}>{votes}/{max}</span>
    </div>
  );
}