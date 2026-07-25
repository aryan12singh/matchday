'use client';

import { useActionState, useState } from 'react';

import { Button } from '../../../../components/ui/Button';
import { type ActionState, regenerateJoinCode } from '../actions';

/**
 * Organizer-only. The code is never readable from the `leagues` table — column SELECT is
 * revoked — so it arrives via the league_join_code() security-definer function.
 */
export function JoinCodePanel({ leagueId, code }: { leagueId: string; code: string }) {
  const [state, formAction, pending] = useActionState(regenerateJoinCode, {} as ActionState);
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/join?code=${code}`;

  return (
    <section className="flex flex-col gap-3 rounded-md bg-surface px-5 py-4 shadow-el-1">
      <h2 className="label">Invite</h2>

      <p className="font-num text-[24px] font-bold tracking-[0.2em] tabular-nums">{code}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? 'Link copied' : 'Copy invite link'}
        </Button>

        <form action={formAction}>
          <input type="hidden" name="leagueId" value={leagueId} />
          <Button type="submit" variant="ghost" loading={pending}>
            New code
          </Button>
        </form>
      </div>

      {state.notice ? (
        <p role="status" className="text-[12.5px] text-success">
          {state.notice}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-[12.5px] text-danger">
          {state.error}
        </p>
      ) : null}

      <p className="text-[12.5px] text-text-3">
        Anyone with this code can join. Generate a new one if it ends up somewhere it
        shouldn&apos;t.
      </p>
    </section>
  );
}
