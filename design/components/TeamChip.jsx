export function TeamChip({ code, size = 28 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: 'var(--surface-3)',
      border: '1px solid var(--border-strong)', display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', font: `700 ${Math.round(size * 0.36)}px var(--font-display)`,
      color: 'var(--text-2)', flex: 'none', letterSpacing: '.02em' }}>{code}</span>
  );
}