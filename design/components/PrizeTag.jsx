export function PrizeTag({ amount, label = 'POT', hidden }) {
  if (hidden) return null; // leagues without a prize scheme render nothing, app-wide
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 26, padding: '0 10px',
      borderRadius: 'var(--r-sm)', background: 'var(--prize-dim)' }}>
      <span style={{ font: 'var(--text-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--prize)' }}>{label}</span>
      <span style={{ font: 'var(--text-num-sm)', fontVariantNumeric: 'tabular-nums', color: 'var(--prize)' }}>{amount}</span>
    </span>
  );
}