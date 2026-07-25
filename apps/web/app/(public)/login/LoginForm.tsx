'use client';

import { useActionState, useState } from 'react';

import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { type AuthActionState, sendMagicLink, signIn, signUp } from './actions';

type Mode = 'sign-in' | 'sign-up' | 'magic-link';

const EMPTY: AuthActionState = {};

const COPY: Record<Mode, { submit: string; alt: string; altLabel: string }> = {
  'sign-in': { submit: 'Sign in', alt: 'sign-up', altLabel: 'Create an account' },
  'sign-up': { submit: 'Create account', alt: 'sign-in', altLabel: 'I already have one' },
  'magic-link': { submit: 'Email me a link', alt: 'sign-in', altLabel: 'Use a password' },
};

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>('sign-in');

  const action =
    mode === 'sign-in' ? signIn : mode === 'sign-up' ? signUp : sendMagicLink;
  const [state, formAction, pending] = useActionState(action, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />

      {mode === 'sign-up' ? (
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          placeholder="How your league sees you"
          hint="Optional — we'll pick one from your email if you skip it."
        />
      ) : null}

      {mode !== 'magic-link' ? (
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          required
          minLength={8}
          {...(mode === 'sign-up' ? { hint: 'At least 8 characters.' } : {})}
        />
      ) : null}

      {/* Errors are announced, not just coloured. */}
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-dim px-4 py-3 text-[13px] text-danger">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p role="status" className="rounded-md bg-success-dim px-4 py-3 text-[13px] text-success">
          {state.notice}
        </p>
      ) : null}

      <Button type="submit" full loading={pending}>
        {COPY[mode].submit}
      </Button>

      <div className="flex flex-col gap-1 text-center">
        <button
          type="button"
          onClick={() => setMode(COPY[mode].alt as Mode)}
          className="min-h-tap text-[13px] text-text-2 underline-offset-4 hover:text-text hover:underline"
        >
          {COPY[mode].altLabel}
        </button>
        {mode !== 'magic-link' ? (
          <button
            type="button"
            onClick={() => setMode('magic-link')}
            className="min-h-tap text-[13px] text-text-3 underline-offset-4 hover:text-text-2 hover:underline"
          >
            Sign in with an email link instead
          </button>
        ) : null}
      </div>
    </form>
  );
}
