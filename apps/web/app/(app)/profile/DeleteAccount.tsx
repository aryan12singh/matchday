'use client';

import { useActionState, useState } from 'react';

import { type ProfileState, deleteAccount } from './actions';

/**
 * Deleting an account, with deliberate friction.
 *
 * Typing the username rather than confirming a dialog: this cannot be undone, and a
 * dialog is dismissed by reflex. The panel also stays collapsed until asked for, so the
 * destructive control is never one stray tap away on a phone.
 */
export function DeleteAccount({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    deleteAccount as (previous: ProfileState, formData: FormData) => Promise<ProfileState>,
    {},
  );

  // A rejected attempt must not collapse the panel: the error belongs next to the field
  // that caused it, and a form that vanishes leaves the user with nothing to correct.
  const expanded = open || Boolean(state.error);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-tap self-start rounded-md border border-line px-4 text-[13px] text-text-2 transition-colors hover:border-danger hover:text-danger"
      >
        Delete my account
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-danger p-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-[15px] font-bold text-text">
          Delete your account permanently
        </h3>
        <p className="text-[13px] text-text-2">
          Your email, username, avatar, league memberships and notification settings are
          destroyed, and you will not be able to sign in again. Points you scored in
          matchweeks other leagues have already completed stay, anonymously, so their
          results still add up.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="label text-text-3">
          Type <span className="text-text">{username}</span> to confirm
        </span>
        <input
          name="confirmUsername"
          autoComplete="off"
          required
          className="min-h-tap rounded-md border border-line bg-surface-2 px-3 text-[14px] text-text focus:border-danger focus:outline-none"
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-[13px] text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-tap rounded-md bg-danger px-4 font-display text-[11px] font-bold uppercase tracking-label text-on-accent disabled:opacity-60"
        >
          {pending ? 'Deleting…' : 'Delete permanently'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-tap rounded-md border border-line px-4 text-[13px] text-text-2 hover:border-line-2 hover:text-text"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
