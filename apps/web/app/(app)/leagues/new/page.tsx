import type { Metadata } from 'next';

import { requireUser } from '../../../../lib/auth';
import { getCurrentSeason } from '../../../../lib/leagues';

import { CreateLeagueForm } from './CreateLeagueForm';

export const metadata: Metadata = { title: 'New league' };

export default async function NewLeaguePage() {
  await requireUser('/leagues/new');
  const season = await getCurrentSeason();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[28px] font-extrabold">New league</h1>
        <p className="text-text-2">
          {season
            ? `You'll be enrolled in ${season.competitionName} ${season.label} and set as organizer.`
            : 'You will be set as organizer. Season enrolment happens once fixtures are loaded.'}
        </p>
      </div>

      <CreateLeagueForm />

      <p className="text-[12.5px] text-text-3">
        Prizes are optional and off by default — a points-only league shows no money
        anywhere.
      </p>
    </div>
  );
}
