import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guards the design-system install (Task 1 standing instruction). These catch the two
 * failure modes that would silently degrade every screen we build later:
 *
 *   - the Tailwind theme referencing a CSS variable no token file defines, so a token
 *     class quietly resolves to nothing;
 *   - the light theme missing a variable the dark theme defines, so light mode falls
 *     back to a dark value mid-page.
 */

const root = join(__dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const colors = read('apps/web/app/styles/tokens/colors.css');
const spacing = read('apps/web/app/styles/tokens/spacing.css');
const typography = read('apps/web/app/styles/tokens/typography.css');
const theme = read('apps/web/tailwind.theme.js');
const globals = read('apps/web/app/globals.css');

/** Custom properties declared inside a specific selector block. */
function declaredIn(css: string, selector: string): Set<string> {
  const start = css.indexOf(selector);
  if (start === -1) return new Set();
  const open = css.indexOf('{', start);
  const end = css.indexOf('\n}', open);
  const block = css.slice(open, end === -1 ? undefined : end);
  return new Set([...block.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1] as string));
}

const darkVars = declaredIn(colors, ':root');
const lightVars = declaredIn(colors, '[data-theme="light"]');

describe('design tokens', () => {
  it('defines dark as the default theme and light as the variant', () => {
    expect(darkVars.size).toBeGreaterThan(20);
    expect(colors).toContain('[data-theme="light"]');
  });

  it('defines every dark colour variable in the light theme too', () => {
    const missing = [...darkVars].filter((name) => !lightVars.has(name));
    expect(missing).toEqual([]);
  });

  it('carries the two brand voices, the money token and the state colours', () => {
    for (const token of [
      '--accent', // volt: the user
      '--live', // coral: the game
      '--prize', // money, hidden when a league has no prize scheme
      '--locked',
      '--void',
      '--success',
      '--danger',
      '--focus-ring',
    ]) {
      expect(darkVars, `${token} missing from dark theme`).toContain(token);
    }
  });

  it('keeps the 44px tap-target floor and the three font families as tokens', () => {
    expect(spacing).toContain('--tap-min: 44px');
    for (const token of ['--font-display', '--font-body', '--font-num']) {
      expect(typography).toContain(token);
    }
  });
});

describe('tailwind theme wiring', () => {
  it('references only CSS variables that the token files define', () => {
    const referenced = [...theme.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1] as string);
    expect(referenced.length).toBeGreaterThan(20);

    const defined = new Set([
      ...darkVars,
      ...declaredIn(spacing, ':root'),
      ...declaredIn(typography, ':root'),
    ]);
    const dangling = [...new Set(referenced)].filter((name) => !defined.has(name));
    expect(dangling).toEqual([]);
  });

  it('is loaded by the app stylesheet along with all three token files', () => {
    expect(globals).toContain("@config '../tailwind.config.js'");
    expect(globals).toContain('./styles/tokens/colors.css');
    expect(globals).toContain('./styles/tokens/typography.css');
    expect(globals).toContain('./styles/tokens/spacing.css');
  });

  it('maps self-hosted next/font families onto the design font tokens', () => {
    // The design bundle's remote font @import is intentionally commented out; if it were
    // re-enabled the three families would load twice, once remote and once self-hosted.
    const withoutComments = typography.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toContain('fonts.googleapis.com');
    expect(globals).toContain('--font-display: var(--font-archivo)');
    expect(globals).toContain('--font-num: var(--font-chivo-mono)');
  });

  it('respects prefers-reduced-motion globally', () => {
    expect(globals).toContain('prefers-reduced-motion: reduce');
  });
});
