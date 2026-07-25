// Tailwind config for apps/web.
//
// The theme itself is design-owned: `tailwind.theme.js` is copied verbatim from
// design/tailwind.theme.js and must never be hand-edited here — re-copy it when the
// design bundle updates. This file only adds the bits Tailwind needs that the design
// bundle does not own (content globs).
//
// Loaded by Tailwind v4 through the `@config` directive in app/globals.css.
const designTheme = require('./tailwind.theme.js');

module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  ...designTheme,
};
