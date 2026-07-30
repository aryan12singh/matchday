import 'server-only';

import { createClient } from './supabase/server';

/**
 * Reading the prize ledger.
 *
 * `prize_settlements` is append-only: a correction inserts a new row pointing at the one
 * it supersedes through `revised_from`, so the table holds the whole history and the
 * current figure is the newest row per (period, user). That is deliberate — money that
 * changes silently is money nobody trusts — but it means "what do I owe" is a query with
 * a rule to it rather than a straight select.
 */

export interface LedgerEntry {
  userId: string;
  username: string;
  avatarUrl: string | null;
  amount: number;
  /** True when this figure replaced an earlier one, so the UI can say so. */
  revised: boolean;
  previousAmount: number | null;
  settledAt: string;
}

export interface LedgerPeriod {
  roundId: string | null;
  roundNumber: number | null;
  label: string;
  entries: LedgerEntry[];
}

export interface LeagueLedger {
  currencyLabel: string;
  periods: LedgerPeriod[];
  /** Per-user totals across every period — the number that actually settles up. */
  totals: LedgerEntry[];
  balanced: boolean;
}

export async function getLeagueLedger(
  leagueSeasonId: string,
): Promise<LeagueLedger | null> {
  const supabase = await createClient();

  // Named FK: the two tables reference each other, so a bare embed is ambiguous.
  const { data: leagueSeason } = await supabase
    .from('league_seasons')
    .select('id, prize_scheme_id, prize_schemes!league_seasons_prize_scheme_fk ( currency_label )')
    .eq('id', leagueSeasonId)
    .maybeSingle();

  // Points-only league. The money UI is hidden entirely rather than shown empty — a
  // ledger of zeroes invites the question "why is this here".
  if (!leagueSeason?.prize_scheme_id) return null;

  const { data: rows } = await supabase
    .from('prize_settlements')
    .select(
      'id, user_id, amount, settled_at, revised_from, period_round_id, rounds ( number, name ), profiles ( username, avatar_url )',
    )
    .eq('league_season_id', leagueSeasonId)
    .order('settled_at', { ascending: false });

  const currencyLabel =
    (leagueSeason.prize_schemes as unknown as { currency_label: string } | null)?.currency_label ??
    '$';

  if (!rows || rows.length === 0) {
    return { currencyLabel, periods: [], totals: [], balanced: true };
  }

  // Newest row per (period, user) is the live figure; older ones are the audit trail.
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const current: typeof rows = [];

  for (const row of rows) {
    const key = `${row.period_round_id ?? 'overall'}:${row.user_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    current.push(row);
  }

  const toEntry = (row: (typeof rows)[number]): LedgerEntry => {
    const previous = row.revised_from ? byId.get(row.revised_from) : undefined;
    return {
      userId: row.user_id,
      username: row.profiles?.username ?? 'player',
      avatarUrl: row.profiles?.avatar_url ?? null,
      amount: Number(row.amount),
      revised: row.revised_from != null,
      previousAmount: previous ? Number(previous.amount) : null,
      settledAt: row.settled_at,
    };
  };

  const periodMap = new Map<string, LedgerPeriod>();

  for (const row of current) {
    const key = row.period_round_id ?? 'overall';
    const round = row.rounds as unknown as { number: number; name: string } | null;

    let period = periodMap.get(key);
    if (!period) {
      period = {
        roundId: row.period_round_id,
        roundNumber: round?.number ?? null,
        label: round ? (round.name ?? `Matchweek ${round.number}`) : 'Season',
        entries: [],
      };
      periodMap.set(key, period);
    }
    period.entries.push(toEntry(row));
  }

  const periods = [...periodMap.values()].sort(
    // Season overall first, then matchweeks newest to oldest.
    (a, b) => (a.roundNumber ?? Infinity) - (b.roundNumber ?? Infinity),
  );
  for (const period of periods) period.entries.sort((a, b) => b.amount - a.amount);

  const totalsMap = new Map<string, LedgerEntry>();
  for (const period of periods) {
    for (const entry of period.entries) {
      const existing = totalsMap.get(entry.userId);
      if (existing) existing.amount = round2(existing.amount + entry.amount);
      else totalsMap.set(entry.userId, { ...entry, revised: false, previousAmount: null });
    }
  }

  const totals = [...totalsMap.values()].sort((a, b) => b.amount - a.amount);

  // A zero-sum scheme must net to nothing. Surfacing this rather than hiding it means a
  // ledger that has drifted says so, instead of quietly asking people to pay each other
  // the wrong amounts.
  const balanced = round2(totals.reduce((sum, entry) => sum + entry.amount, 0)) === 0;

  return { currencyLabel, periods, totals, balanced };
}

const round2 = (value: number) => Math.round(value * 100) / 100;
