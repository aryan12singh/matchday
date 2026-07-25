import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EmptyState } from '../../../../../components/ui/EmptyState';
import { requireUser } from '../../../../../lib/auth';
import { getLeague } from '../../../../../lib/leagues';
import { getCurrentRoundId } from '../../../../../lib/predictions';
import { createClient } from '../../../../../lib/supabase/server';

import { SelectionBoard, type SelectionFixture } from './SelectionBoard';

export const metadata: Metadata = { title: 'Fixture selection' };

export default async function SelectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ round?: string }>;
}) {
  const { id } = await params;
  const { round } = await searchParams;
  await requireUser(`/leagues/${id}/selection`);

  const league = await getLeague(id);
  if (!league || !league.leagueSeasonId) notFound();

  // A league counting everything has nothing to decide.
  if (league.selectionMode === 'all') {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        <h1 className="font-display text-[28px] font-extrabold">Fixture selection</h1>
        <EmptyState
          title="Every fixture counts in this league."
          body="An organizer can switch to picking or voting in league settings."
        />
      </main>
    );
  }

  const roundId = round ?? (await getCurrentRoundId());
  if (!roundId) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        <h1 className="font-display text-[28px] font-extrabold">Fixture selection</h1>
        <EmptyState
          title="No fixtures loaded yet."
          body="Voting opens once the season is imported and the round's fixtures are confirmed."
        />
      </main>
    );
  }

  const supabase = await createClient();

  const [{ data: state }, { data: roundRow }] = await Promise.all([
    supabase.rpc('round_selection_state', {
      p_league_season_id: league.leagueSeasonId,
      p_round_id: roundId,
    }),
    supabase.from('rounds').select('name').eq('id', roundId).maybeSingle(),
  ]);

  const fixtures: SelectionFixture[] = (state ?? []).map((row) => ({
    fixtureId: row.fixture_id,
    kickoffAt: row.kickoff_at,
    homeName: row.home_name,
    awayName: row.away_name,
    homeCode: row.home_code,
    awayCode: row.away_code,
    votes: row.votes,
    votedByMe: row.voted_by_me,
    selected: row.selected,
  }));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <p className="label">{league.name}</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">
          {league.selectionMode === 'vote' ? 'Vote on fixtures' : 'Pick fixtures'}
        </h1>
      </header>

      <SelectionBoard
        leagueSeasonId={league.leagueSeasonId}
        roundId={roundId}
        roundName={roundRow?.name ?? 'This round'}
        fixtures={fixtures}
        isOrganizer={league.role === 'organizer'}
        mode={league.selectionMode === 'vote' ? 'vote' : 'admin_pick'}
        finalized={fixtures.some((f) => f.selected)}
        memberCount={league.memberCount}
      />
    </main>
  );
}
