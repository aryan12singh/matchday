export function ScoreStepper({ value, onChange, disabled }) {
  const btn = (d, glyph) => (
    <button disabled={disabled} onClick={() => onChange && onChange(Math.max(0, (value ?? 0) + d))}
      style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)',
        background: 'var(--surface-2)', color: disabled ? 'var(--text-3)' : 'var(--text)',
        font: '700 18px var(--font-display)', cursor: disabled ? 'default' : 'pointer' }}>{glyph}</button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {btn(-1, '−')}
      <span style={{ minWidth: 40, textAlign: 'center', font: 'var(--text-num-lg)',
        fontVariantNumeric: 'tabular-nums', color: value == null ? 'var(--text-3)' : 'var(--text)' }}>
        {value == null ? '–' : value}</span>
      {btn(1, '+')}
    </div>
  );
}