import type { Metadata } from 'next';

import { CountdownChip } from '../../../components/match/CountdownChip';
import { EmptyState } from '../../../components/ui/EmptyState';
import { requireUser } from '../../../lib/auth';
import { createClient } from '../../../lib/supabase/server';

import { GoldenBootPicker } from './GoldenBootPicker';
import { TablePredictor, type PredictorTeam } from './TablePredictor';

export const metadata: Metadata = { title: 'Season table' };

/**
 * Screen 22 — the season-long game. Entered once, locked at the season's first kickoff
 * with no grace window and no late entries (addendum §H.5).
 */
export default async function SeasonTablePage() {
  const user = await requireUser('/table');
  const supabase = await createClient();

  const { data: season } = await supabase
    .from('seasons')
    .select('id, label, first_kickoff_at, competitions ( name )')
    .eq('is_current', true)
    .maybeSingle();

  if (!season) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        <h1 className="font-display text-[28px] font-extrabold">Season table</h1>
        <EmptyState
          title="No season loaded yet."
          body="Once the season is imported you can rank all 20 teams here."
        />
      </main>
    );
  }

  const [{ data: teamRows }, { data: markets }] = await Promise.all([
    supabase
      .from('team_season_entries')
      .select('teams ( id, name, code )')
      .eq('season_id', season.id),
    supabase
      .from('markets')
      .select('id, status, locks_at, market_types!inner ( code )')
      .eq('season_id', season.id)
      .in('market_types.code', ['season_table', 'season_golden_boot']),
  ]);

  const teams: PredictorTeam[] = (teamRows ?? [])
    .map((row) => row.teams)
    .filter((team): team is NonNullable<typeof team> => team != null)
    .map((team) => ({ id: team.id, name: team.name, code: team.code }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const tableMarket = (markets ?? []).find((m) => m.market_types?.code === 'season_table');
  const bootMarket = (markets ?? []).find(
    (m) => m.market_types?.code === 'season_golden_boot',
  );

  const { data: existing } = tableMarket
    ? await supabase
        .from('predictions')
        .select('value')
        .eq('user_id', user.id)
        .eq('market_id', tableMarket.id)
        .maybeSingle()
    : { data: null };

  const initialOrder =
    ((existing?.value as { order?: string[] } | null)?.order ?? []).filter(Boolean);

  // Lock state comes from the market, not from comparing first_kickoff_at to the clock.
  const locked = tableMarket ? tableMarket.status !== 'open' : false;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <p className="label">
          {season.competitions?.name ?? 'Season'} {season.label}
        </p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">
          Predict the table
        </h1>
        {tableMarket && !locked ? (
          <CountdownChip target={tableMarket.locks_at} label="Locks at first kickoff" />
        ) : null}
      </header>

      {teams.length < 20 ? (
        <EmptyState
          title="Teams aren't loaded yet."
          body={`The season needs all 20 teams before you can rank them — ${teams.length} so far.`}
        />
      ) : (
        <TablePredictor
          seasonId={season.id}
          teams={teams}
          initialOrder={initialOrder}
          locked={locked}
        />
      )}

      {bootMarket ? (
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="label">Golden Boot</h2>
          <GoldenBootPicker
            seasonId={season.id}
            locked={bootMarket.status !== 'open'}
          />
        </section>
      ) : null}
    </main>
  );
}
