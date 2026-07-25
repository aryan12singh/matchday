import type { Metadata } from 'next';
import { Suspense } from 'react';

import { EmptyState, Skeleton } from '../../../components/ui/EmptyState';
import { requireUser } from '../../../lib/auth';
import { getCurrentRoundId, getMatchweek } from '../../../lib/predictions';

import { PredictBoard } from './PredictBoard';

export const metadata: Metadata = { title: 'Predict' };

export default async function PredictPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  await requireUser('/predict');

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <Suspense fallback={<MatchweekSkeleton />}>
        <MatchweekSection searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function MatchweekSection({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  const user = await requireUser('/predict');
  const { round } = await searchParams;

  const roundId = round ?? (await getCurrentRoundId());

  // No fixtures at all: the season bootstrap has not run yet. This is the state the app
  // is in right now, before the provider key exists, so it needs to read as "not yet"
  // rather than "broken".
  if (!roundId) {
    return (
      <>
        <h1 className="font-display text-[28px] font-extrabold">Predict</h1>
        <EmptyState
          title="No fixtures loaded yet."
          body="The season hasn't been imported. Once it is, your matchweek appears here."
        />
      </>
    );
  }

  const matchweek = await getMatchweek(roundId, user.id);

  if (!matchweek) {
    return (
      <>
        <h1 className="font-display text-[28px] font-extrabold">Predict</h1>
        <EmptyState title="That matchweek doesn't exist." body="Try the current one." />
      </>
    );
  }

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="label">Matchweek {matchweek.number}</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">
          {matchweek.name}
        </h1>
      </header>

      {matchweek.fixtures.length === 0 ? (
        <EmptyState
          title="No fixtures in this matchweek."
          body="They may not have been confirmed yet."
        />
      ) : (
        <PredictBoard matchweek={matchweek} />
      )}
    </>
  );
}

function MatchweekSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading matchweek">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-52" />
      <Skeleton className="h-2 w-full" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}
