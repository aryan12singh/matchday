'use client';

import { useActionState } from 'react';

import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { type ActionState, joinLeague } from '../leagues/actions';

export function JoinForm({ defaultCode }: { defaultCode: string }) {
  const [state, formAction, pending] = useActionState(joinLeague, {} as ActionState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field
        label="Join code"
        name="code"
        required
        defaultValue={defaultCode}
        // Codes are generated from an alphabet without I, L, O or U precisely because
        // they get typed by hand; uppercase and monospace make that easier still.
        inputClassName="font-num uppercase tracking-[0.2em]"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        placeholder="XXXXXXXXXX"
      />

      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-dim px-4 py-3 text-[13px] text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" full loading={pending}>
        Join league
      </Button>
    </form>
  );
}
