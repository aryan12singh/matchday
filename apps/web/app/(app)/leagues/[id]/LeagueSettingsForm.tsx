'use client';

import { useActionState } from 'react';

import { Button } from '../../../../components/ui/Button';
import { type ActionState, updateLeagueSettings } from '../actions';

const REVEAL_OPTIONS = [
  { value: 'at_kickoff', label: 'At kickoff', hint: 'Picks appear once the match locks.' },
  { value: 'always', label: 'Always', hint: 'Still only after lock — never before.' },
  {
    value: 'after_own_submission',
    label: 'After you predict',
    hint: 'You must have predicted the match to see anyone else’s.',
  },
] as const;

const SELECTION_OPTIONS = [
  { value: 'all', label: 'All fixtures', hint: 'Every match in the round counts.' },
  { value: 'admin_pick', label: 'You pick', hint: 'You choose which matches count.' },
  {
    value: 'vote',
    label: 'Members vote',
    hint: 'Everyone votes; you finalise. Votes are advisory.',
  },
] as const;

export function LeagueSettingsForm({
  leagueSeasonId,
  revealPolicy,
  selectionMode,
}: {
  leagueSeasonId: string;
  revealPolicy: string;
  selectionMode: string;
}) {
  const [state, formAction, pending] = useActionState(updateLeagueSettings, {} as ActionState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="leagueSeasonId" value={leagueSeasonId} />

      <RadioGroup
        name="revealPolicy"
        legend="When picks become visible"
        options={REVEAL_OPTIONS}
        defaultValue={revealPolicy}
      />

      <RadioGroup
        name="selectionMode"
        legend="Which fixtures count"
        options={SELECTION_OPTIONS}
        defaultValue={selectionMode}
      />

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

      <Button type="submit" variant="secondary" loading={pending}>
        Save settings
      </Button>
    </form>
  );
}

function RadioGroup({
  name,
  legend,
  options,
  defaultValue,
}: {
  name: string;
  legend: string;
  options: readonly { value: string; label: string; hint: string }[];
  defaultValue: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="label pb-2">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex min-h-tap cursor-pointer items-start gap-3 rounded-md px-3 py-2 hover:bg-surface-2"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={defaultValue === option.value}
            className="mt-1 accent-[var(--accent)]"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-[14px]">{option.label}</span>
            <span className="text-[12.5px] text-text-3">{option.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
