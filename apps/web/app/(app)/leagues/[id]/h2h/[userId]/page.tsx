import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DEFAULT_WEIGHTS, resolveWeights, ruleSetDefinitionSchema } from '@matchday/domain';

import { EmptyState } from '../../../../../../components/ui/EmptyState';
import { requireUser } from '../../../../../../lib/auth';
import { getLeague } from '../../../../../../lib/leagues';
import { CATEGORY_COPY } from '../../../../../../lib/rules';
import { createClient } from '../../../../../../lib/supabase/server';

export const metadata: Metadata = { title: 'Head to head' };

/**
 * Head-to-head (§4.2 screen 12) — "settle arguments".
 *
 * Per-matchweek series plus category strengths. Both are computed from the same score
 * components the leaderboard uses and valued under the league's own weights, so the
 * totals here can never disagree with the board.
 */
export default async function HeadToHeadPage({
  params,
}: {
  params: Promise<{ id: string; userId: string }>;
}) {
  const { id, userId } = await params;
  await requireUser(`/leagues/${id}/h2h/${userId}`);

  const league = await getLeague(id);
  if (!league || !league.leagueSeasonId) notFound();

  const them = league.members.find((m) => m.userId === userId);
  if (!them) notFound();

  const supabase = await createClient();
  const [{ data: rows }, { data: definition }] = await Promise.all([
    supabase.rpc('head_to_head', {
      p_league_season_id: league.leagueSeasonId,
      p_other_user_id: userId,
    }),
    supabase.rpc('league_weights', { p_league_season_id: league.leagueSeasonId }),
  ]);

  const parsed = definition ? ruleSetDefinitionSchema.safeParse(definition) : null;
  const weights = parsed?.success ? resolveWeights(parsed.data) : DEFAULT_WEIGHTS;

  // Fold the per-category rows into a per-round series and a category tally.
  const rounds = new Map<string, { number: number; name: string; mine: number; theirs: number }>();
  const categories = new Map<string, { mine: number; theirs: number }>();

  for (const row of rows ?? []) {
    const weight = weights[row.category as keyof typeof weights] ?? 0;

    const round = rounds.get(row.round_id) ?? {
      number: row.round_number,
      name: row.round_name,
      mine: 0,
      theirs: 0,
    };
    if (row.mine) round.mine += weight;
    if (row.theirs) round.theirs += weight;
    rounds.set(row.round_id, round);

    const category = categories.get(row.category) ?? { mine: 0, theirs: 0 };
    if (row.mine) category.mine += 1;
    if (row.theirs) category.theirs += 1;
    categories.set(row.category, category);
  }

  const series = [...rounds.values()].sort((a, b) => a.number - b.number);
  const myTotal = series.reduce((sum, r) => sum + r.mine, 0);
  const theirTotal = series.reduce((sum, r) => sum + r.theirs, 0);
  const won = series.filter((r) => r.mine > r.theirs).length;
  const lost = series.filter((r) => r.mine < r.theirs).length;
  const drawn = series.filter((r) => r.mine === r.theirs).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <Link
        href={`/leagues/${id}/members`}
        className="inline-flex min-h-tap items-center font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
      >
        ‹ Members
      </Link>

      <header className="flex flex-col gap-2">
        <p className="label">{league.name}</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">
          You v {them.username}
        </h1>
      </header>

      {series.length === 0 ? (
        <EmptyState
          title="Nothing settled between you yet."
          body="Once a matchweek settles, the series and category breakdown fill in."
        />
      ) : (
        <>
          <section className="flex items-end gap-6">
            <div className="flex flex-col gap-1">
              <span className="font-num text-[40px] font-bold leading-none tabular-nums">
                {myTotal}
              </span>
              <span className="label text-accent">You</span>
            </div>
            <div className="flex flex-col gap-1 pb-1">
              <span className="font-num text-[16px] tabular-nums text-text-3">
                {won}W {drawn}D {lost}L
              </span>
              <span className="text-[12.5px] text-text-3">
                across{' '}
                <span className="font-num tabular-nums">{series.length}</span>{' '}
                {series.length === 1 ? 'matchweek' : 'matchweeks'}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-right">
              <span className="font-num text-[40px] font-bold leading-none tabular-nums text-text-2">
                {theirTotal}
              </span>
              <span className="label">{them.username}</span>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="label">By matchweek</h2>
            <ul className="flex flex-col divide-y divide-border">
              {series.map((round) => {
                const max = Math.max(round.mine, round.theirs, 1);
                return (
                  <li key={round.name} className="flex items-center gap-3 py-3">
                    <span className="w-24 shrink-0 truncate text-[12.5px] text-text-3">
                      {round.name}
                    </span>
                    {/* Two bars from a shared centre — the shape is the argument. */}
                    <span className="flex flex-1 items-center gap-1">
                      <span className="flex flex-1 justify-end">
                        <span
                          className="h-2 rounded-l-full bg-accent"
                          style={{ width: `${(round.mine / max) * 100}%` }}
                        />
                      </span>
                      <span className="flex flex-1">
                        <span
                          className="h-2 rounded-r-full bg-surface-3"
                          style={{ width: `${(round.theirs / max) * 100}%` }}
                        />
                      </span>
                    </span>
                    <span className="w-16 shrink-0 text-right font-num text-[13px] tabular-nums">
                      {round.mine}–{round.theirs}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="label">Where it&apos;s won and lost</h2>
            <ul className="flex flex-col divide-y divide-border">
              {[...categories.entries()]
                .sort((a, b) => b[1].mine - b[1].theirs - (a[1].mine - a[1].theirs))
                .map(([category, tally]) => {
                  const diff = tally.mine - tally.theirs;
                  return (
                    <li key={category} className="flex items-center gap-3 py-2">
                      <span className="flex-1 truncate text-[13px]">
                        {CATEGORY_COPY[category]?.label ?? category}
                      </span>
                      <span className="font-num text-[13px] tabular-nums text-text-2">
                        {tally.mine}–{tally.theirs}
                      </span>
                      <span
                        className={`w-10 text-right font-num text-[12px] tabular-nums ${
                          diff > 0 ? 'text-success' : diff < 0 ? 'text-danger' : 'text-text-3'
                        }`}
                      >
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
