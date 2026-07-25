export function CountdownChip({ label = 'LOCKS IN', time, urgent }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px',
      borderRadius: 'var(--r-sm)', background: urgent ? 'var(--live-dim)' : 'var(--surface-2)',
      border: `1px solid ${urgent ? 'var(--live)' : 'var(--border)'}` }}>
      <span style={{ font: 'var(--text-label)', letterSpacing: 'var(--tracking-label)',
        color: urgent ? 'var(--live)' : 'var(--text-2)' }}>{label}</span>
      <span style={{ font: 'var(--text-num-sm)', fontVariantNumeric: 'tabular-nums',
        color: urgent ? 'var(--live)' : 'var(--text)' }}>{time}</span>
    </span>
  );
}