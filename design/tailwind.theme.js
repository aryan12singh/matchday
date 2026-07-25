// MatchDay Tailwind theme — drop into tailwind.config.{js,ts} theme.extend.
// Values reference the CSS variables in tokens/*.css, so dark/light (and future
// colorway switching) works by toggling [data-theme] on <html> — no class churn.
module.exports = {
  darkMode: ['selector', '[data-theme="light"]'], // dark is :root default; light is the variant
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)', 3: 'var(--surface-3)' },
        border: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        text: { DEFAULT: 'var(--text)', 2: 'var(--text-2)', 3: 'var(--text-3)' },
        accent: { DEFAULT: 'var(--accent)', dim: 'var(--accent-dim)' },
        'on-accent': 'var(--on-accent)',
        live: { DEFAULT: 'var(--live)', dim: 'var(--live-dim)' },
        'on-live': 'var(--on-live)',
        success: { DEFAULT: 'var(--success)', dim: 'var(--success-dim)' },
        danger: { DEFAULT: 'var(--danger)', dim: 'var(--danger-dim)' },
        warning: { DEFAULT: 'var(--warning)', dim: 'var(--warning-dim)' },
        locked: { DEFAULT: 'var(--locked)', dim: 'var(--locked-dim)' },
        void: 'var(--void)',
        prize: { DEFAULT: 'var(--prize)', dim: 'var(--prize-dim)' },
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        body: ['"Public Sans"', 'system-ui', 'sans-serif'],
        num: ['"Chivo Mono"', 'ui-monospace', 'monospace'], // tabular by design; still set tabular-nums
      },
      borderRadius: { sm: '6px', md: '10px', lg: '16px' },
      spacing: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px', 10: '40px', 12: '48px' },
      boxShadow: {
        'el-1': '0 0 0 1px var(--border)',
        'el-2': '0 0 0 1px var(--border), 0 4px 16px rgba(0,0,0,.35)',
        'el-3': '0 0 0 1px var(--border-strong), 0 12px 40px rgba(0,0,0,.5)',
      },
      letterSpacing: { label: '.12em' },
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
    },
  },
};
// Usage notes:
// - Numbers: className="font-num tabular-nums" everywhere digits align (scores, ranks, countdowns).
// - Labels: font-display font-bold text-[11px] uppercase tracking-label text-text-2.
// - Volt (accent) = user's actions/picks. Coral (live) = in-play match state. Never swap them.
// - Money UI: gate every prize-colored element behind league.prizeSchemeId != null.