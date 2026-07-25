import type { Metadata, Viewport } from 'next';

import { THEME_SCRIPT } from '../components/ui/ThemeToggle';

import { fontVariables } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'MatchDay',
    template: '%s · MatchDay',
  },
  description: 'Season-long football predictions for private leagues.',
  applicationName: 'MatchDay',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    title: 'MatchDay',
    // Dark chrome so the notch area matches the app rather than flashing white.
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Two entries so the browser chrome follows the theme rather than always being dark.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0B0C0D' },
    { media: '(prefers-color-scheme: light)', color: '#F5F5F3' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Installed as a PWA this sits under the notch; the shell pads for safe areas.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the inline script below mutates data-theme before React
    // hydrates, which is a deliberate server/client difference.
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Blocking and inline on purpose. Anything later renders dark first and then
            flips, which is a full-page white flash for light-mode users on every load. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-bg font-body text-text antialiased">
        {/* Keyboard and screen-reader users get past the nav without tabbing through it. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-3 focus:font-display focus:text-[13px] focus:font-bold focus:uppercase focus:tracking-label focus:text-on-accent"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
