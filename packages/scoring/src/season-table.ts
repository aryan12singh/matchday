import type { SeasonTableOutcome, SeasonTableScore, SeasonTableValue } from '@matchday/domain';

/**
 * Season table predictor — addendum §C.
 *
 * A separate, lowest-wins competition (invariant 8): score = Σ|predicted − actual|
 * position. It is never merged into weekly or overall points; it has its own board
 * ("Table race") and may have its own prize line.
 *
 * Tiebreaks, in order: total_abs asc, then total_sq asc (one catastrophic miss is worse
 * than several small ones), then exact_hits desc.
 */

const TOP_4 = 4;
const RELEGATION_PLACES = 3;

export function scoreSeasonTable(
  prediction: SeasonTableValue,
  outcome: SeasonTableOutcome,
): SeasonTableScore {
  // Position lookup for the actual table: team id -> 1-based position.
  const actualPosition = new Map<string, number>();
  outcome.order.forEach((teamId, index) => actualPosition.set(teamId, index + 1));

  const teamCount = outcome.order.length;
  const perTeam: SeasonTableScore['perTeam'] = [];
  let totalAbs = 0;
  let totalSq = 0;
  let exactHits = 0;
  let top4Hits = 0;
  let relegationHits = 0;

  prediction.order.forEach((teamId, index) => {
    const predicted = index + 1;
    // A team that is not in the actual table at all (mid-season withdrawal, or a table
    // that has not been fully populated yet) is scored as maximally wrong rather than
    // skipped, so totals stay comparable between users.
    const actual = actualPosition.get(teamId) ?? teamCount;
    const diff = Math.abs(predicted - actual);

    totalAbs += diff;
    totalSq += diff * diff;
    if (diff === 0) exactHits += 1;
    if (predicted <= TOP_4 && actual <= TOP_4) top4Hits += 1;
    if (predicted > teamCount - RELEGATION_PLACES && actual > teamCount - RELEGATION_PLACES) {
      relegationHits += 1;
    }
    perTeam.push({ teamId, predicted, actual, diff });
  });

  // Derived after the loop rather than tracked inside it: a perfect table has no biggest
  // miss worth showing, so the zero case has to be excluded either way.
  const worst = perTeam.reduce<SeasonTableScore['biggestMiss']>(
    (worstSoFar, team) =>
      worstSoFar == null || team.diff > worstSoFar.diff
        ? { teamId: team.teamId, diff: team.diff }
        : worstSoFar,
    null,
  );

  return {
    totalAbs,
    totalSq,
    exactHits,
    championHit: prediction.order[0] != null && prediction.order[0] === outcome.order[0],
    top4Hits,
    relegationHits,
    biggestMiss: worst != null && worst.diff > 0 ? worst : null,
    perTeam,
  };
}

export interface TableRaceEntry {
  userId: string;
  score: SeasonTableScore;
  joinedAt: string;
}

export interface TableRaceRow extends TableRaceEntry {
  rank: number;
}

/**
 * The Table race board. Lowest total_abs wins; ties break on total_sq asc, exact_hits
 * desc, then joined_at asc (addendum §D). Genuinely tied users share a rank.
 */
export function rankTableRace(entries: readonly TableRaceEntry[]): TableRaceRow[] {
  const sorted = [...entries].sort(
    (a, b) =>
      a.score.totalAbs - b.score.totalAbs ||
      a.score.totalSq - b.score.totalSq ||
      b.score.exactHits - a.score.exactHits ||
      a.joinedAt.localeCompare(b.joinedAt),
  );

  const rows: TableRaceRow[] = [];
  sorted.forEach((entry, index) => {
    const previous = rows[index - 1];
    const tiedWithPrevious =
      previous != null &&
      previous.score.totalAbs === entry.score.totalAbs &&
      previous.score.totalSq === entry.score.totalSq &&
      previous.score.exactHits === entry.score.exactHits;

    rows.push({ ...entry, rank: tiedWithPrevious ? previous.rank : index + 1 });
  });

  return rows;
}
