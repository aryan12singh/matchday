import Image from 'next/image';
import Link from 'next/link';

import { signOut } from '../(public)/login/actions';

/**
 * Authenticated header. Navigation fills out as the screens land (predict, leaderboards,
 * league home); for now it carries the wordmark, the signed-in identity and a way out.
 */
export function AppHeader({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl: string | null;
}) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/home" aria-label="MatchDay home" className="flex min-h-tap items-center">
          <Image src="/wordmark.svg" alt="MatchDay" width={132} height={22} priority />
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1">
          {[
            { href: '/predict', label: 'Predict' },
            { href: '/table', label: 'Table' },
            { href: '/leagues', label: 'Leagues' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-tap items-center rounded-md px-3 font-display text-[11px] font-bold uppercase tracking-label text-text-2 hover:bg-surface-2 hover:text-text"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-[13px] text-text-2">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt=""
                width={28}
                height={28}
                className="size-7 rounded-full bg-surface-3 object-cover"
              />
            ) : (
              // Neutral monogram, the same device team chips use — never an uploaded
              // image we have not vetted.
              <span
                aria-hidden="true"
                className="flex size-7 items-center justify-center rounded-full bg-surface-3 font-display text-[11px] font-bold uppercase"
              >
                {username.slice(0, 2)}
              </span>
            )}
            <span className="hidden sm:inline">{username}</span>
          </span>

          <form action={signOut}>
            <button
              type="submit"
              className="min-h-tap px-2 font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
