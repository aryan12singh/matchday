import { Archivo, Chivo_Mono, Public_Sans } from 'next/font/google';

/**
 * The three design-bundle families, self-hosted by next/font. Each exposes a CSS
 * variable that app/globals.css maps onto the design tokens --font-display,
 * --font-body and --font-num. Weights match design/tokens/typography.css exactly.
 */

export const archivo = Archivo({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  variable: '--font-archivo',
  display: 'swap',
});

export const chivoMono = Chivo_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-chivo-mono',
  display: 'swap',
});

export const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-public-sans',
  display: 'swap',
});

export const fontVariables = `${archivo.variable} ${chivoMono.variable} ${publicSans.variable}`;
