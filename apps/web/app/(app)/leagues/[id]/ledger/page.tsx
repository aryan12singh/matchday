import { notFound, redirect } from 'next/navigation';

import { EmptyState } from '../../../../../components/ui/EmptyState';
import { requireUser } from '../../../../../lib/auth';
import { getLeague } from '../../../../../lib/leagues';
import { getLeagueLedger } from '../../../../../lib/prizes';

export const metadata = { title: 'Ledger' };

/**
 * The prize ledger — who owes whom.
 *
 * Only reachable when the league has a prize scheme. Every money surface in the app is
 * hidden outright for a points-only league (§6.5), not shown empty, so this 404s rather
 * than rendering an explanation nobody asked for.
 */
export default async function LedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) redirect('/login');

  const league = await getLeague(id);
  if (!league) notFound();
  if (!league.leagueSeasonId || !league.prizeSchemeId) notFound();

  const ledger = await getLeagueLedger(league.leagueSeasonId);
  if (!ledger) notFound();

  const money = (amount: number) =>
    `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${ledger.currencyLabel}${Math.abs(amount).toFixed(2)}`;

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 md:pb-10">
      <header className="pb-6">
        <p className="label text-text-3">{league.name}</p>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-text">Ledger</h1>
        <p className="pt-1 text-[13.5px] text-text-2">
          Settled from the leaderboard. MatchDay never moves money — this is a record for
          you to settle up between yourselves.
        </p>
      </header>

      {ledger.totals.length === 0 ? (
        <EmptyState
          title="Nothing settled yet"
          body="Amounts appear once a matchweek has been scored."
        />
      ) : (
        <>
          <section aria-labelledby="totals" className="pb-8">
            <h2 id="totals" className="label pb-3 text-text-3">
              Overall
            </h2>
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {ledger.totals.map((entry) => (
                <li
                  key={entry.userId}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="truncate text-[15px] text-text">{entry.username}</span>
                  <span
                    className={`num text-[15px] font-medium tabular-nums ${
                      entry.amount > 0
                        ? 'text-success'
                        : entry.amount < 0
                          ? 'text-danger'
                          : 'text-text-3'
                    }`}
                  >
                    {money(entry.amount)}
                  </span>
                </li>
              ))}
            </ul>

            {!ledger.balanced ? (
              // A zero-sum scheme that does not net to zero is a real problem, not a
              // rounding curiosity: somebody is owed money nobody owes.
              <p role="alert" className="pt-3 text-[13px] text-danger">
                These amounts do not net to zero. Ask an organizer to re-check the prize
                table before settling up.
              </p>
            ) : null}
          </section>

          {ledger.periods.map((period) => (
            <section key={period.roundId ?? 'overall'} aria-labelledby={`p-${period.roundId ?? 'o'}`} className="pb-6">
              <h2 id={`p-${period.roundId ?? 'o'}`} className="label pb-3 text-text-3">
                {period.label}
              </h2>
              <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
                {period.entries.map((entry) => (
                  <li
                    key={entry.userId}
                    className="flex min-h-14 items-center justify-between gap-3 px-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] text-text">{entry.username}</span>
                      {entry.revised && entry.previousAmount != null ? (
                        // A corrected result moves money. Saying so — and showing what it
                        // was — is the difference between an audit trail and a surprise.
                        <span className="block text-[12px] text-text-3">
                          Revised from {money(entry.previousAmount)} after a result correction
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`num shrink-0 text-[15px] tabular-nums ${
                        entry.amount > 0
                          ? 'text-success'
                          : entry.amount < 0
                            ? 'text-danger'
                            : 'text-text-3'
                      }`}
                    >
                      {money(entry.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
