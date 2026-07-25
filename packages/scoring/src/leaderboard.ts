import {
  type CategoryWeights,
  type ScoreCategory,
  type ScoreComponent,
  SCORE_CATEGORIES,
} from '@matchday/domain';

/**
 * Leaderboard aggregation — ported from ../wc26-predictor/lib/leaderboard.ts.
 *
 * Generalised in two ways: inputs are score components rather than `pts_*` columns, and
 * the tiebreak chain is data (it lives in the rule-set version) rather than a hard-coded
 * comparator, so two leagues could order differently. The v1 chain is the old one,
 * verbatim.
 */

/** One settled component belonging to a user, in a market that counts for this board. */
export interface ComponentRow extends ScoreComponent {
  userId: string;
  marketId: string;
}

/** A score_components row as the database returns it — `category` is plain text there. */
export interface RawComponentRow {
  user_id: string;
  market_id: string;
  category: string;
  hit: boolean;
}

/**
 * Narrows database rows to ComponentRow, dropping unknown categories.
 *
 * Dropping rather than casting is deliberate: a component written by a future engine
 * version must not be valued at whatever `weights[unknown]` happens to be. Better to
 * under-count visibly than to award points from a category this build does not
 * understand.
 */
export function toComponentRows(rows: readonly RawComponentRow[]): ComponentRow[] {
  const known = new Set<string>(SCORE_CATEGORIES);
  return rows
    .filter((row) => known.has(row.category))
    .map((row) => ({
      userId: row.user_id,
      marketId: row.market_id,
      category: row.category as ScoreCategory,
      hit: row.hit,
    }));
}

export interface LeaderboardMember {
  userId: string;
  username: string;
  avatarUrl?: string | null;
  /** Tiebreak of last resort, so ordering is deterministic. */
  joinedAt: string;
}

export interface LeaderboardRow {
  userId: string;
  username: string;
  avatarUrl: string | null;
  points: number;
  /** Markets this user was settled on — the "submissions" tiebreak. */
  submissions: number;
  /** Per-category hit counts, the middle of the tiebreak chain. */
  hits: Record<ScoreCategory, number>;
  /** Correct-outcome accuracy as a whole percentage, for display. */
  accuracy: number;
  rank: number;
  isYou: boolean;
}

const emptyHits = (): Record<ScoreCategory, number> =>
  Object.fromEntries(SCORE_CATEGORIES.map((c) => [c, 0])) as Record<ScoreCategory, number>;

/**
 * The canonical v1 tiebreak chain, from compareLeaderboard() in the old repo:
 *
 *   points -> outcomes -> exacts -> goal diffs -> total goals -> BTTS ->
 *   first-goal team -> first scorer -> predictions submitted -> shared rank
 *
 * Prediction accuracy decides everything first. "Submissions" is deliberately last, so
 * entering more fixtures only helps once every accuracy category is level — otherwise the
 * board would reward volume over skill.
 */
export const DEFAULT_TIEBREAKS: readonly string[] = [
  'points',
  'outcome',
  'exact',
  'goal_diff',
  'total_goals',
  'btts',
  'first_team',
  'first_scorer',
  'submissions',
];

function compareBy(chain: readonly string[]) {
  return (a: LeaderboardRow, b: LeaderboardRow): number => {
    for (const key of chain) {
      const delta =
        key === 'points'
          ? b.points - a.points
          : key === 'submissions'
            ? b.submissions - a.submissions
            : (b.hits[key as ScoreCategory] ?? 0) - (a.hits[key as ScoreCategory] ?? 0);
      if (delta !== 0) return delta;
    }
    return 0;
  };
}

/**
 * Builds a ranked board from settled components.
 *
 * Every member is seeded at zero so the whole league appears before a ball is kicked —
 * an empty leaderboard on day one reads as a broken app.
 *
 * `components` must already be filtered to the markets that count for this board: the
 * round's markets for a matchweek board, and for a league using fixture selection, only
 * the fixtures that league selected (invariant 7). Filtering is the caller's job because
 * only the caller knows the league; doing it here would need a database.
 */
export function aggregateLeaderboard({
  components,
  members,
  weights,
  viewerId = null,
  tiebreaks = DEFAULT_TIEBREAKS,
}: {
  components: readonly ComponentRow[];
  members: readonly LeaderboardMember[];
  weights: CategoryWeights;
  viewerId?: string | null;
  tiebreaks?: readonly string[];
}): LeaderboardRow[] {
  const rows = new Map<string, LeaderboardRow>();

  for (const member of members) {
    rows.set(member.userId, {
      userId: member.userId,
      username: member.username,
      avatarUrl: member.avatarUrl ?? null,
      points: 0,
      submissions: 0,
      hits: emptyHits(),
      accuracy: 0,
      rank: 0,
      isYou: member.userId === viewerId,
    });
  }

  // Distinct markets per user, so `submissions` counts fixtures entered rather than
  // categories settled (the old board counted one row per prediction; here a single
  // prediction produces eight components).
  const marketsByUser = new Map<string, Set<string>>();

  for (const component of components) {
    const row = rows.get(component.userId);
    // A component from someone who is not a member of this league is not an error — the
    // same global prediction is settled once and read by every league. Skip it.
    if (!row) continue;

    if (component.hit) {
      row.points += weights[component.category] ?? 0;
      row.hits[component.category] += 1;
    }

    let markets = marketsByUser.get(component.userId);
    if (!markets) {
      markets = new Set();
      marketsByUser.set(component.userId, markets);
    }
    markets.add(component.marketId);
  }

  for (const [userId, markets] of marketsByUser) {
    const row = rows.get(userId);
    if (row) row.submissions = markets.size;
  }

  const ordered = [...rows.values()]
    .map((row) => ({
      ...row,
      accuracy: row.submissions > 0 ? Math.round((row.hits.outcome / row.submissions) * 100) : 0,
    }))
    .sort(compareBy(tiebreaks));

  const compare = compareBy(tiebreaks);
  ordered.forEach((row, index) => {
    const previous = ordered[index - 1];
    // Genuine ties share a rank; the chain is long enough that this stays rare.
    row.rank = previous != null && compare(previous, row) === 0 ? previous.rank : index + 1;
  });

  return ordered;
}

/**
 * Current correct-outcome streak, most recent first. `results` must be ordered by kickoff
 * descending — the caller has the fixture times, this function stays pure.
 */
export function currentStreak(results: readonly boolean[]): number {
  let streak = 0;
  for (const correct of results) {
    if (!correct) break;
    streak += 1;
  }
  return streak;
}
