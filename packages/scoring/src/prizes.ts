/**
 * Prize allocation — turning a finished leaderboard into who owes whom.
 *
 * The app never moves money (§6.5). This is a ledger among friends, which is exactly why
 * it has to be arithmetically exact: nobody reconciles a spreadsheet against their bank,
 * they reconcile it against each other, and a table that does not balance means somebody
 * is owed money that nobody owes.
 *
 * Pure, and in @matchday/scoring so it stays that way — repo-check forbids IO here.
 *
 * The hard part is ties, and they are common in a private league of eight people over one
 * matchweek. Two players tied for first do not both take the first prize: the amounts for
 * the positions they jointly occupy are pooled and split. That is the only split that
 * leaves the table summing to zero, which is the property the whole scheme rests on.
 */

export interface PrizeEntrant {
  userId: string;
  /** 1-based, with ties sharing a rank — exactly what the leaderboard already produces. */
  rank: number;
}

export interface PrizeAllocation {
  userId: string;
  rank: number;
  amount: number;
  /** How many entrants shared this rank, so the UI can explain a split. */
  sharedWith: number;
}

/** Money is rounded to cents; anything finer cannot be settled between people. */
const CENTS = 100;
const round = (value: number) => Math.round(value * CENTS) / CENTS;

/**
 * Allocates a prize table across ranked entrants.
 *
 * `table[i]` is the amount for position i+1. Entrants beyond the table's length get
 * nothing, which is what a table shorter than the league means.
 */
export function allocatePrizes(
  entrants: readonly PrizeEntrant[],
  table: readonly number[],
): PrizeAllocation[] {
  if (entrants.length === 0 || table.length === 0) return [];

  // Group by rank. Ties share a rank, and the positions they occupy are contiguous
  // starting at that rank.
  const byRank = new Map<number, PrizeEntrant[]>();
  for (const entrant of entrants) {
    const group = byRank.get(entrant.rank);
    if (group) group.push(entrant);
    else byRank.set(entrant.rank, [entrant]);
  }

  const allocations: PrizeAllocation[] = [];

  for (const [rank, group] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) {
    // Three players tied for 2nd occupy positions 2, 3 and 4 — so they share the 2nd,
    // 3rd and 4th prizes between them, not three copies of the 2nd.
    const positions = group.map((_, index) => rank + index);
    const pooled = positions.reduce((total, position) => total + (table[position - 1] ?? 0), 0);
    const share = round(pooled / group.length);

    for (const entrant of group) {
      allocations.push({
        userId: entrant.userId,
        rank,
        amount: share,
        sharedWith: group.length,
      });
    }
  }

  return settleRounding(allocations, table, entrants.length);
}

/**
 * Pushes any rounding residue onto one allocation so the total is exactly zero.
 *
 * Three people splitting £10 get £3.33 each and a penny goes missing. Left alone that
 * penny compounds across a season of matchweeks into a ledger that visibly does not
 * balance, and the first person to notice loses confidence in all of it. The residue is
 * given to the top-ranked entrant, deterministically — it has to land somewhere, and
 * "whoever finished highest" is at least explicable.
 */
function settleRounding(
  allocations: PrizeAllocation[],
  table: readonly number[],
  entrantCount: number,
): PrizeAllocation[] {
  if (allocations.length === 0) return allocations;

  // Only the positions actually occupied count towards the target.
  const target = round(
    table.slice(0, Math.min(entrantCount, table.length)).reduce((a, b) => a + b, 0),
  );
  const actual = round(allocations.reduce((total, a) => total + a.amount, 0));
  const residue = round(target - actual);

  if (residue === 0) return allocations;

  const best = allocations.reduce((a, b) => (a.rank <= b.rank ? a : b));
  return allocations.map((allocation) =>
    allocation === best ? { ...allocation, amount: round(allocation.amount + residue) } : allocation,
  );
}

/**
 * Whether a table can be used at all.
 *
 * The database enforces this too (`upsert_prize_scheme`), deliberately: a scheme that does
 * not balance is a data problem rather than a display one, and it should be impossible to
 * store. This exists so the engine can refuse a scheme that predates the check rather than
 * writing a ledger it knows to be wrong.
 */
export function isZeroSum(table: readonly number[]): boolean {
  return round(table.reduce((a, b) => a + b, 0)) === 0;
}

export interface PrizeScheme {
  kind: string;
  /** Amount by finishing position for the season. */
  overall?: number[];
  /** Amount by finishing position within a single matchweek. */
  perRound?: number[];
}

/** Reads a stored scheme definition, tolerating the shapes the admin form can produce. */
export function parsePrizeScheme(kind: string, definition: unknown): PrizeScheme | null {
  if (typeof definition !== 'object' || definition === null) return null;

  const record = definition as Record<string, unknown>;
  const numbers = (value: unknown): number[] | undefined =>
    Array.isArray(value) && value.every((entry) => typeof entry === 'number')
      ? (value as number[])
      : undefined;

  return {
    kind,
    overall: numbers(record.overall),
    perRound: numbers(record.per_round) ?? numbers(record.perRound),
  };
}
