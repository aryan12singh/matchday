export function StateBadge({ state, children }) {
  const map = {
    live:    { c: 'var(--live)',    bg: 'var(--live-dim)',    label: 'LIVE',    dot: true },
    locked:  { c: 'var(--locked)',  bg: 'var(--locked-dim)',  label: 'LOCKED' },
    settled: { c: 'var(--success)', bg: 'var(--success-dim)', label: 'SETTLED' },
    void:    { c: 'var(--void)',    bg: 'transparent',        label: 'VOID' },
    pending: { c: 'var(--warning)', bg: 'var(--warning-dim)', label: 'PENDING' },
  };
  const s = map[state] || map.pending;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px',
      borderRadius: 'var(--r-sm)', background: s.bg, border: state === 'void' ? '1px dashed var(--void)' : 'none' }}>
      {s.dot && <span className="md-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: s.c }} />}
      {state === 'locked' && <svg width="9" height="11" viewBox="0 0 9 11"><path d="M1.5 5V3.5a3 3 0 016 0V5" stroke={s.c} strokeWidth="1.4" fill="none"/><rect x="0.7" y="4.8" width="7.6" height="5.5" rx="1.2" fill={s.c}/></svg>}
      <span style={{ font: 'var(--text-label)', letterSpacing: 'var(--tracking-label)', color: s.c }}>{children || s.label}</span>
    </span>
  );
}