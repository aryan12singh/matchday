'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { InstallPrompt } from '../../components/pwa/InstallPrompt';
import { ServiceWorkerRegistrar } from '../../components/pwa/ServiceWorkerRegistrar';
import { CommandPalette } from '../../components/ui/CommandPalette';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { Wordmark } from '../../components/ui/Wordmark';

/**
 * Responsive app shell.
 *
 * Two genuinely different layouts rather than one that stretches:
 *
 *   ≥1024px — persistent left sidebar, content in a centred column. The desktop user is
 *             the primary user here, and a 1440px screen showing a 640px phone layout
 *             with two empty gutters is the thing that makes a web app feel like a
 *             wrapped mobile site.
 *   <1024px — top bar with identity, bottom tab bar for navigation. Thumbs reach the
 *             bottom of a phone; they do not reach the top.
 *
 * The bottom bar pads for the home indicator via env(safe-area-inset-bottom), which
 * matters once this is installed as a PWA and there is no browser chrome below it.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Shown as a small count, e.g. unpredicted fixtures. */
  badge?: number;
}

export function AppShell({
  username,
  avatarUrl,
  leagues,
  unpredicted,
  signOut,
  children,
}: {
  username: string;
  avatarUrl: string | null;
  leagues: Array<{ id: string; name: string }>;
  unpredicted: number;
  signOut: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K anywhere in the app. Lives here rather than in the palette because this
  // is where the open state is — a component cannot toggle a prop it does not own.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((wasOpen) => !wasOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const nav: NavItem[] = [
    { href: '/home', label: 'Home', icon: <IconHome /> },
    {
      href: '/predict',
      label: 'Predict',
      icon: <IconPredict />,
      ...(unpredicted > 0 ? { badge: unpredicted } : {}),
    },
    { href: '/live', label: 'Live', icon: <IconLive /> },
    { href: '/table', label: 'Table', icon: <IconTable /> },
    { href: '/teams', label: 'Teams', icon: <IconTeams /> },
    { href: '/leagues', label: 'Leagues', icon: <IconLeagues /> },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="lg:flex lg:min-h-dvh">
      <ServiceWorkerRegistrar />
      <InstallPrompt />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        leagues={leagues}
      />

      {/* ---------------- desktop sidebar ---------------- */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:gap-6 lg:border-r lg:border-border lg:px-4 lg:py-6">
        <Link href="/home" aria-label="MatchDay home" className="flex min-h-tap items-center px-2">
          <Wordmark width={140} height={24} priority />
        </Link>

        <nav aria-label="Main" className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`flex min-h-tap items-center gap-3 rounded-md px-3 font-display text-[12px] font-bold uppercase tracking-label ${
                isActive(item.href)
                  ? 'bg-surface-2 text-text'
                  : 'text-text-3 hover:bg-surface-2 hover:text-text'
              }`}
            >
              <span aria-hidden="true" className={isActive(item.href) ? 'text-accent' : ''}>
                {item.icon}
              </span>
              {item.label}
              {item.badge ? (
                <span className="ml-auto rounded-full bg-accent px-2 font-num text-[11px] font-bold tabular-nums text-on-accent">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex min-h-tap items-center justify-between rounded-md bg-surface-2 px-3 text-[13px] text-text-3 hover:text-text"
        >
          Search
          <kbd className="font-num text-[11px]">⌘K</kbd>
        </button>

        <div className="mt-auto flex flex-col gap-3">
          <ThemeToggle />
          <Link
            href="/profile"
            className="flex min-h-tap items-center gap-2 rounded-md px-1 hover:bg-surface-2"
          >
            <Avatar username={username} avatarUrl={avatarUrl} />
            <span className="flex-1 truncate text-[13px] text-text-2">{username}</span>
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="min-h-tap px-1 font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ---------------- mobile top bar ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Link href="/home" aria-label="MatchDay home" className="flex min-h-tap items-center">
              <Wordmark width={124} height={21} priority />
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search"
                className="flex min-h-tap min-w-tap items-center justify-center rounded-md text-text-3 hover:text-text"
              >
                <IconSearch />
              </button>
              <ThemeToggle compact />
              <Link href="/profile" aria-label="Profile" className="flex min-h-tap items-center">
                <Avatar username={username} avatarUrl={avatarUrl} />
              </Link>
            </div>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 pb-24 lg:pb-0">
          {children}
        </main>

        {/* ---------------- mobile bottom tabs ---------------- */}
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur lg:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <ul className="flex">
            {nav.filter((item) => item.href !== '/teams').map((item) => (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={`relative flex min-h-tap flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold uppercase tracking-label ${
                    isActive(item.href) ? 'text-accent' : 'text-text-3'
                  }`}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                  {item.badge ? (
                    <span className="absolute right-1/2 top-1 translate-x-4 rounded-full bg-accent px-1.5 font-num text-[10px] font-bold tabular-nums text-on-accent">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function Avatar({ username, avatarUrl }: { username: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={32}
        height={32}
        className="size-8 rounded-full bg-surface-3 object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-8 items-center justify-center rounded-full bg-surface-3 font-display text-[11px] font-bold uppercase"
    >
      {username.slice(0, 2)}
    </span>
  );
}

/* Inline SVGs rather than an icon dependency: five icons is not worth a package, and
   currentColor keeps them on-theme automatically. */
const svg = 'size-5 fill-none stroke-current stroke-[1.75]';

const IconHome = () => (
  <svg viewBox="0 0 24 24" className={svg} aria-hidden="true">
    <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" strokeLinejoin="round" />
  </svg>
);
const IconPredict = () => (
  <svg viewBox="0 0 24 24" className={svg} aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M8 10h8M8 14h5" strokeLinecap="round" />
  </svg>
);
const IconLive = () => (
  <svg viewBox="0 0 24 24" className={svg} aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" strokeLinecap="round" />
  </svg>
);
const IconTable = () => (
  <svg viewBox="0 0 24 24" className={svg} aria-hidden="true">
    <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
  </svg>
);
const IconLeagues = () => (
  <svg viewBox="0 0 24 24" className={svg} aria-hidden="true">
    <path d="M6 4h12v5a6 6 0 1 1-12 0z" strokeLinejoin="round" />
    <path d="M9 21h6M12 15v6" strokeLinecap="round" />
  </svg>
);
const IconTeams = () => (
  <svg viewBox="0 0 24 24" className={svg} aria-hidden="true">
    <circle cx="9" cy="8" r="3" />
    <circle cx="17" cy="10" r="2.5" />
    <path d="M3 19a6 6 0 0 1 12 0M15 19a5 5 0 0 1 6-4.6" strokeLinecap="round" />
  </svg>
);
const IconSearch = () => (
  <svg viewBox="0 0 24 24" className={svg} aria-hidden="true">
    <circle cx="11" cy="11" r="6" />
    <path d="m16 16 4 4" strokeLinecap="round" />
  </svg>
);
