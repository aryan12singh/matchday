'use client';

import { useActionState } from 'react';

import { Button } from '../../../../components/ui/Button';
import { type ProfileState, updateNotificationPrefs } from '../../profile/actions';

const TYPES: Array<{ type: string; label: string; hint: string }> = [
  {
    type: 'deadline_reminder',
    label: 'Deadline reminder',
    hint: 'Only when you have fixtures left unpredicted — never a blanket nag.',
  },
  { type: 'lineups_posted', label: 'Lineups posted', hint: 'About an hour before kickoff. Worth it if you pick first scorers.' },
  { type: 'results_and_points', label: 'Results and my points', hint: 'When a matchweek settles.' },
  { type: 'rank_change', label: 'Rank changes', hint: 'When you move in a league table.' },
  { type: 'recap_ready', label: 'Recap ready', hint: 'The weekly story, once it settles.' },
  { type: 'voting_open', label: 'Fixture voting open', hint: 'Leagues that vote on which matches count.' },
  { type: 'selection_finalized', label: 'Selection finalised', hint: 'Which fixtures ended up counting.' },
];

export function NotificationForm({
  prefs,
  leadMinutes,
  pushSupported,
}: {
  prefs: Record<string, boolean>;
  leadMinutes: number;
  pushSupported: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateNotificationPrefs,
    {} as ProfileState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="label py-2 pr-4 font-normal">Notify me about</th>
              <th scope="col" className="label w-16 py-2 text-center font-normal">Push</th>
              <th scope="col" className="label w-16 py-2 text-center font-normal">Email</th>
            </tr>
          </thead>
          <tbody>
            {TYPES.map((row) => (
              <tr key={row.type} className="border-b border-border">
                <td className="py-3 pr-4">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[14px]">{row.label}</span>
                    <span className="text-[12.5px] text-text-3">{row.hint}</span>
                  </span>
                </td>
                {(['push', 'email'] as const).map((channel) => (
                  <td key={channel} className="py-3 text-center">
                    <label className="inline-flex min-h-tap min-w-tap items-center justify-center">
                      <span className="sr-only">
                        {row.label} by {channel}
                      </span>
                      <input
                        type="checkbox"
                        name={`${row.type}:${channel}`}
                        defaultChecked={prefs[`${row.type}:${channel}`] ?? false}
                        disabled={channel === 'push' && !pushSupported}
                        className="size-5 accent-[var(--accent)] disabled:opacity-30"
                      />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="flex flex-col gap-2">
        <span className="label">Remind me this long before kickoff</span>
        <select
          name="lead_minutes"
          defaultValue={String(leadMinutes)}
          className="min-h-tap w-48 rounded-md bg-surface-2 px-3 shadow-el-1"
        >
          <option value="1440">24 hours</option>
          <option value="360">6 hours</option>
          <option value="180">3 hours</option>
          <option value="60">1 hour</option>
        </select>
      </label>

      {!pushSupported ? (
        <p className="rounded-md bg-surface-2 px-4 py-3 text-[13px] text-text-2">
          Push needs the app installed to your home screen. Email works everywhere.{' '}
          <a href="/install" className="underline underline-offset-4">
            How to install
          </a>
        </p>
      ) : null}

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

      <Button type="submit" loading={pending}>
        Save preferences
      </Button>
    </form>
  );
}
