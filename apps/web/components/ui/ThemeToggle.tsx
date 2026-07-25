'use client';

import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'matchday-theme';

/**
 * Theme toggle.
 *
 * Dark is `:root` and light is `[data-theme="light"]` (design/tokens/colors.css), so
 * switching is one attribute on <html> — every token flips and no component re-renders.
 *
 * Three states, not two. "System" is the default because a phone that switches to dark at
 * sunset should take the app with it; an explicit choice then pins it.
 */
export function applyTheme(theme: Theme) {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;

  if (resolved === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system';
    setTheme(stored);

    // Following the system means following it as it changes, not just at load.
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) as Theme | null) === 'system' || !localStorage.getItem(STORAGE_KEY)) {
        applyTheme('system');
      }
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  const options: Array<{ value: Theme; label: string; icon: string }> = [
    { value: 'light', label: 'Light', icon: '☀' },
    { value: 'dark', label: 'Dark', icon: '☾' },
    { value: 'system', label: 'System', icon: '◐' },
  ];

  if (compact) {
    // Cycles light -> dark -> system. The label names the *current* state and the title
    // names what tapping does, so it is never ambiguous to a screen reader.
    const index = options.findIndex((option) => option.value === theme);
    const current = options[index] ?? options[2]!;
    const next = options[(index + 1) % options.length] ?? options[0]!;

    return (
      <button
        type="button"
        onClick={() => choose(next.value)}
        aria-label={`Theme: ${current.label}. Switch to ${next.label}.`}
        title={`Switch to ${next.label}`}
        className="flex min-h-tap min-w-tap items-center justify-center rounded-md text-[15px] text-text-3 hover:text-text"
      >
        <span aria-hidden="true">{current.icon}</span>
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => choose(option.value)}
          className={`flex min-h-tap min-w-tap items-center justify-center rounded-sm text-[13px] ${
            theme === option.value
              ? 'bg-surface-3 text-text'
              : 'text-text-3 hover:text-text-2'
          }`}
        >
          <span aria-hidden="true">{option.icon}</span>
          <span className="sr-only">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Inline script that sets the theme before first paint.
 *
 * Without this the page renders dark, then flips to light on hydration — a full-page
 * white flash on every navigation for light-mode users. It has to be a blocking inline
 * script in <head>; there is no React-level equivalent that runs early enough.
 */
export const THEME_SCRIPT = `(function(){try{
var t=localStorage.getItem('${STORAGE_KEY}')||'system';
var l=t==='light'||(t==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches);
if(l)document.documentElement.setAttribute('data-theme','light');
}catch(e){}})();`;
