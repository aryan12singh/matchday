import type { Metadata } from 'next';
import Image from 'next/image';

import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Same-origin only; the action re-validates this before redirecting.
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/home';

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-12">
      <header className="flex flex-col gap-3">
        <Image src="/wordmark.svg" alt="MatchDay" width={168} height={28} priority />
        <p className="text-text-2">
          Season-long predictions, settled properly, with the people who will not let you
          forget it.
        </p>
      </header>

      <LoginForm next={safeNext} />

      <p className="text-[12.5px] text-text-3">
        Private leagues only. Your picks stay hidden from your league until kickoff.
      </p>
    </main>
  );
}
