export function Button({ variant = 'primary', children, disabled, onClick, full }) {
  const base = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 'var(--tap-min)', padding: '0 20px', borderRadius: 'var(--r-md)', cursor: disabled ? 'default' : 'pointer',
    font: '800 14px var(--font-display)', letterSpacing: '.02em', border: '1px solid transparent',
    opacity: disabled ? 0.45 : 1, width: full ? '100%' : undefined, transition: 'filter .12s, transform .08s' };
  const variants = {
    primary: { background: 'var(--accent)', color: 'var(--on-accent)' },
    secondary: { background: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--border-strong)' },
    ghost: { background: 'transparent', color: 'var(--text-2)' },
    danger: { background: 'var(--danger-dim)', color: 'var(--danger)', borderColor: 'var(--danger)' },
  };
  return <button style={{ ...base, ...variants[variant] }} disabled={disabled} onClick={onClick}
    onMouseDown={e => e.currentTarget.style.transform = 'scale(.98)'}
    onMouseUp={e => e.currentTarget.style.transform = ''}>{children}</button>;
}