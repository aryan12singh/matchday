import type { Metadata } from 'next';

import { requireUser } from '../../../lib/auth';
import { previewLeague } from '../../../lib/leagues';

import { JoinForm } from './JoinForm';

export const metadata: Metadata = { title: 'Join a league' };

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  await requireUser(code ? `/join?code=${encodeURIComponent(code)}` : '/join');

  // Shared links carry ?code=, so show what they are about to join before they commit.
  const preview = code ? await previewLeague(code) : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[28px] font-extrabold">Join a league</h1>
        {preview ? (
          <p className="text-text-2">
            <span className="font-display font-bold text-text">{preview.name}</span> —{' '}
            <span className="font-num tabular-nums">{preview.memberCount}</span>
            {preview.memberCount === 1 ? ' member' : ' members'} already in.
          </p>
        ) : (
          <p className="text-text-2">Enter the code whoever set up the league sent you.</p>
        )}
      </div>

      {/* An invalid code in the link is not an error state yet — they can still fix it. */}
      {code && !preview ? (
        <p role="status" className="rounded-md bg-warning-dim px-4 py-3 text-[13px] text-warning">
          We couldn&apos;t find a league for that link. Check the code below.
        </p>
      ) : null}

      <JoinForm defaultCode={code ?? ''} />
    </div>
  );
}
