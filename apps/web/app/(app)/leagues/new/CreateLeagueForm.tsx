'use client';

import { useActionState } from 'react';

import { Button } from '../../../../components/ui/Button';
import { Field } from '../../../../components/ui/Field';
import { type ActionState, createLeague } from '../actions';

export function CreateLeagueForm() {
  const [state, formAction, pending] = useActionState(createLeague, {} as ActionState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field
        label="League name"
        name="name"
        required
        maxLength={60}
        placeholder="The Boot Room"
        hint="Your mates will see this. You can change it later."
      />

      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-dim px-4 py-3 text-[13px] text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" full loading={pending}>
        Create league
      </Button>
    </form>
  );
}
