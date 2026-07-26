import type { Metadata } from 'next';

import { requireUser } from '../../../lib/auth';
import { getMyLeagues } from '../../../lib/leagues';
import { CATEGORY_COPY, getRules } from '../../../lib/rules';

export const metadata: Metadata = { title: 'Rules' };

/**
 * Scoring rules (§4.2 screen 25 / IA `/rules`).
 *
 * Rendered from the rule-set version the league is actually bound to, not from constants.
 * People are playing for money under these; a page that could drift from the engine would
 * be worse than no page.
 */
export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const user = await requireUser('/rules');
  const { league: leagueId } = await searchParams;

  const leagues = await getMyLeagues(user.id);
  const selected = leagueId
    ? leagues.find((l) => l.id === leagueId)
    : leagues.find((l) => l.leagueSeasonId);

  const rules = await getRules(selected?.leagueSeasonId ?? null);

  const scored = Object.entries(rules.weights).filter(([, weight]) => weight > 0);
  const off = Object.entries(rules.weights).filter(([, weight]) => weight === 0);
  const maxPerFixture = scored.reduce((sum, [, weight]) => sum + weight, 0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <p className="label">
          {rules.leagueName ?? 'Default rules'}
          {rules.version != null ? ` · version ${rules.version}` : ''}
        </p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">How scoring works</h1>
        <p className="text-text-2">
          Every fixture is scored across the categories below, independently. A perfect
          call is worth <span className="font-num tabular-nums text-text">{maxPerFixture}</span>{' '}
          points.
        </p>
      </header>

      {leagues.length > 1 ? (
        <nav aria-label="League" className="flex flex-wrap gap-2">
          {leagues.map((l) => (
            <a
              key={l.id}
              href={`/rules?league=${l.id}`}
              aria-current={selected?.id === l.id ? 'page' : undefined}
              className={`inline-flex min-h-tap items-center rounded-md px-4 font-display text-[11px] font-bold uppercase tracking-label ${
                selected?.id === l.id ? 'bg-accent text-on-accent' : 'bg-surface-2 text-text-2'
              }`}
            >
              {l.name}
            </a>
          ))}
        </nav>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="label">What scores</h2>
        <ul className="flex flex-col divide-y divide-border">
          {scored
            .sort((a, b) => b[1] - a[1])
            .map(([category, weight]) => (
              <li key={category} className="flex items-start gap-4 py-3">
                <span className="w-10 shrink-0 font-num text-[18px] font-bold tabular-nums text-accent">
                  +{weight}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[14px]">
                    {CATEGORY_COPY[category]?.label ?? category}
                  </span>
                  <span className="text-[12.5px] text-text-3">
                    {CATEGORY_COPY[category]?.how ?? ''}
                  </span>
                </span>
              </li>
            ))}
        </ul>
      </section>

      {off.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="label">Switched off in this league</h2>
          <ul className="flex flex-col divide-y divide-border">
            {off.map(([category]) => (
              <li key={category} className="flex items-start gap-4 py-3 opacity-70">
                <span className="w-10 shrink-0 font-num text-[18px] font-bold tabular-nums text-text-3">
                  0
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[14px]">{CATEGORY_COPY[category]?.label ?? category}</span>
                  <span className="text-[12.5px] text-text-3">
                    {CATEGORY_COPY[category]?.how ?? ''} Still recorded, so an organizer can
                    switch it on later without re-scoring anything.
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="label">Ties</h2>
        <p className="text-[14px] text-text-2">
          Level on points? These decide it, in order. Accuracy comes first — entering more
          fixtures only helps once every category is level.
        </p>
        <ol className="flex flex-wrap gap-2">
          {rules.tiebreaks.map((key, index) => (
            <li
              key={key}
              className="inline-flex items-center gap-2 rounded-sm bg-surface-2 px-3 py-1 text-[12.5px]"
            >
              <span className="font-num tabular-nums text-text-3">{index + 1}</span>
              {key === 'points'
                ? 'Total points'
                : key === 'submissions'
                  ? 'Fixtures entered'
                  : (CATEGORY_COPY[key]?.label ?? key)}
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label">The season table</h2>
        <p className="text-[14px] text-text-2">
          Predicting the final 20-team table is a separate competition. You score the total
          number of places you are out across all twenty teams, and{' '}
          <span className="text-text">lowest wins</span>. It never mixes into your weekly or
          overall points.
        </p>
      </section>

      {rules.history.length > 1 ? (
        <section className="flex flex-col gap-3">
          <h2 className="label">Rule history</h2>
          <p className="text-[12.5px] text-text-3">
            Versions are immutable. Changing weights creates a new version from a chosen
            round — past results are never re-scored.
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {rules.history.map((entry) => (
              <li key={`${entry.version}-${entry.effectiveFromRound}`} className="flex items-baseline gap-3 py-2">
                <span className="font-num text-[13px] tabular-nums">v{entry.version}</span>
                <span className="flex-1 text-[13px] text-text-2">
                  from matchweek {entry.effectiveFromRound}
                  {entry.notes ? ` — ${entry.notes}` : ''}
                </span>
                <span className="font-num text-[12px] tabular-nums text-text-3">
                  {new Date(entry.boundAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
