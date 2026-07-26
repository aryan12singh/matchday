'use client';

import { useActionState, useState } from 'react';

import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { type ProfileState, rotateCalendarToken, updateProfile } from './actions';

export function ProfileForm({
  username,
  timezone,
  colorblind,
  calendarUrl,
}: {
  username: string;
  timezone: string | null;
  colorblind: boolean;
  calendarUrl: string;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, {} as ProfileState);
  const [copied, setCopied] = useState(false);
  const [rotateState, setRotateState] = useState<ProfileState>({});

  return (
    <div className="flex flex-col gap-8">
      <form action={formAction} className="flex flex-col gap-5">
        <Field
          label="Username"
          name="username"
          defaultValue={username}
          required
          minLength={3}
          maxLength={24}
          hint="How your leagues see you."
          {...(state.error ? { error: state.error } : {})}
        />

        <Field
          label="Timezone"
          name="timezone"
          defaultValue={timezone ?? ''}
          placeholder={Intl.DateTimeFormat().resolvedOptions().timeZone}
          hint="Leave blank to follow your device. Kickoff times are shown in this zone."
        />

        <label className="flex min-h-tap cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="colorblind"
            defaultChecked={colorblind}
            className="mt-1 size-5 accent-[var(--accent)]"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-[14px]">Colourblind-friendly emphasis</span>
            <span className="text-[12.5px] text-text-3">
              Adds shapes and labels wherever colour carries meaning. State is never
              colour-only anyway — this makes the distinctions louder.
            </span>
          </span>
        </label>

        {state.notice ? (
          <p role="status" className="text-[12.5px] text-success">
            {state.notice}
          </p>
        ) : null}

        <Button type="submit" loading={pending}>
          Save profile
        </Button>
      </form>

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="label">Calendar feed</h2>
        <p className="text-[13px] text-text-2">
          Subscribe in any calendar app to get your fixtures with kickoff times. The link
          contains a private token — anyone with it can see your fixture list.
        </p>

        <p className="break-all rounded-md bg-surface-2 px-4 py-3 font-num text-[12px] text-text-3">
          {calendarUrl}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(calendarUrl);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => setRotateState(await rotateCalendarToken())}
          >
            Rotate token
          </Button>
        </div>

        {rotateState.notice ? (
          <p role="status" className="text-[12.5px] text-success">
            {rotateState.notice}
          </p>
        ) : null}
      </section>
    </div>
  );
}
