import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EmptyState } from '../../../../../components/ui/EmptyState';
import { requireUser } from '../../../../../lib/auth';
import { getLeaderboard, getTableRace } from '../../../../../lib/leaderboard';
import { getLeague } from '../../../../../lib/leagues';
import { getCurrentRoundId } from '../../../../../lib/predictions';
import { createClient } from '../../../../../lib/supabase/server';

import { LeaderboardTable } from './LeaderboardTable';
import { TableRaceBoard } from './TableRaceBoard';

export const metadata: Metadata = { title: 'Leaderboard' };

type Tab = 'overall' | 'matchweek' | 'table-race';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overall', label: 'Overall' },
  { value: 'matchweek', label: 'Matchweek' },
  { value: 'table-race', label: 'Table race' },
];

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; round?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab, round } = await searchParams;
  const user = await requireUser(`/leagues/${id}/leaderboard`);

  const league = await getLeague(id);
  if (!league || !league.leagueSeasonId) notFound();

  const tab: Tab = TABS.some((t) => t.value === rawTab) ? (rawTab as Tab) : 'overall';

  const supabase = await createClient();
  const { data: leagueSeason } = await supabase
    .from('league_seasons')
    .select('season_id')
    .eq('id', league.leagueSeasonId)
    .single();

  const roundId = tab === 'matchweek' ? (round ?? (await getCurrentRoundId())) : null;
  const { data: roundRow } = roundId
    ? await supabase.from('rounds').select('number, name').eq('id', roundId).maybeSingle()
    : { data: null };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <p className="label">{league.name}</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">Leaderboard</h1>
      </header>

      <nav role="tablist" aria-label="Leaderboard view" className="flex gap-2">
        {TABS.map((option) => (
          <Link
            key={option.value}
            role="tab"
            aria-selected={tab === option.value}
            href={`/leagues/${id}/leaderboard?tab=${option.value}`}
            className={`inline-flex min-h-tap items-center rounded-md px-4 font-display text-[11px] font-bold uppercase tracking-label ${
              tab === option.value
                ? 'bg-accent text-on-accent'
                : 'bg-surface-2 text-text-2 hover:text-text'
            }`}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {tab === 'table-race' ? (
        <TableRaceSection
          leagueSeasonId={league.leagueSeasonId}
          seasonId={leagueSeason?.season_id ?? ''}
          viewerId={user.id}
        />
      ) : (
        <PointsSection
          leagueSeasonId={league.leagueSeasonId}
          leagueId={id}
          viewerId={user.id}
          roundId={roundId}
          roundNumber={roundRow?.number ?? null}
          roundName={roundRow?.name ?? null}
          hasPrizes={league.prizeSchemeId != null}
        />
      )}
    </div>
  );
}

async function PointsSection({
  leagueSeasonId,
  leagueId,
  viewerId,
  roundId,
  roundNumber,
  roundName,
  hasPrizes,
}: {
  leagueSeasonId: string;
  leagueId: string;
  viewerId: string;
  roundId: string | null;
  roundNumber: number | null;
  roundName: string | null;
  hasPrizes: boolean;
}) {
  const { rows } = await getLeaderboard({
    leagueSeasonId,
    leagueId,
    viewerId,
    roundId,
    roundNumber,
  });

  const anyScored = rows.some((row) => row.submissions > 0);

  if (!anyScored) {
    return (
      <EmptyState
        title="Nothing settled yet."
        body={
          roundName
            ? `${roundName} hasn't been played. Everyone starts level.`
            : 'Once the first matchweek settles, the table fills in. Everyone starts level.'
        }
      />
    );
  }

  return (
    <>
      {roundName ? <p className="label">{roundName}</p> : null}
      <LeaderboardTable rows={rows} hasPrizes={hasPrizes} />
    </>
  );
}

async function TableRaceSection({
  leagueSeasonId,
  seasonId,
  viewerId,
}: {
  leagueSeasonId: string;
  seasonId: string;
  viewerId: string;
}) {
  const { rows } = await getTableRace({ leagueSeasonId, seasonId, viewerId });

  if (rows.length === 0) {
    return (
      <EmptyState
        title="The table race hasn't started."
        body="Entries stay hidden until the season's first kickoff, and there's no table to measure against until matches are played."
      />
    );
  }

  return <TableRaceBoard rows={rows} />;
}
