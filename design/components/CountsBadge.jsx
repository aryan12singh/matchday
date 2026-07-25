export function CountsBadge({ league, counts = true }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, padding: '0 8px',
      borderRadius: 'var(--r-sm)', background: counts ? 'var(--accent-dim)' : 'transparent',
      border: counts ? 'none' : '1px dashed var(--border-strong)' }}>
      <span style={{ width: 5, height: 5, borderRadius: 1.5, background: counts ? 'var(--accent)' : 'var(--text-3)' }} />
      <span style={{ font: '600 10px var(--font-display)', letterSpacing: '.06em',
        color: counts ? 'var(--accent)' : 'var(--text-3)' }}>{counts ? `COUNTS · ${league}` : `NOT IN ${league}`}</span>
    </span>
  );
}