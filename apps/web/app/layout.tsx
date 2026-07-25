import type { Metadata, Viewport } from 'next';

import { fontVariables } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'MatchDay',
    template: '%s · MatchDay',
  },
  description: 'Season-long football predictions for private leagues.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#0B0C0D',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Dark is the default theme (:root); light is opt-in via data-theme="light".
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-dvh bg-bg text-text font-body antialiased">{children}</body>
    </html>
  );
}
