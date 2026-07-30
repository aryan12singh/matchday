import Link from 'next/link';

import { Wordmark } from '../../../components/ui/Wordmark';

/**
 * Shared shell for the legal pages.
 *
 * Reachable signed out — someone deciding whether to sign up needs to read these before
 * they have an account, which is why /legal is in the middleware's public prefixes.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" aria-label="MatchDay home" className="inline-flex min-h-tap items-center">
            <Wordmark width={120} height={20} />
          </Link>
          <nav className="flex gap-4">
            <Link
              href="/legal/terms"
              className="inline-flex min-h-tap items-center text-[13px] text-text-2 hover:text-text"
            >
              Terms
            </Link>
            <Link
              href="/legal/privacy"
              className="inline-flex min-h-tap items-center text-[13px] text-text-2 hover:text-text"
            >
              Privacy
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8">
        {children}
      </main>
    </div>
  );
}
