/**
 * Plain-English copy for each scoring category.
 *
 * Deliberately NOT in lib/rules.ts: that module is `server-only` because it queries the
 * database, and the weight editor is a client component that needs these labels. Copy has
 * no server dependency, so it lives on its own and both sides import it.
 */
export const CATEGORY_COPY: Record<string, { label: string; how: string }> = {
  outcome: { label: 'Correct outcome', how: 'You called the win, draw or loss.' },
  exact: {
    label: 'Exact scoreline',
    how: 'Both scores exactly right. Stacks on top of the outcome.',
  },
  goal_diff: {
    label: 'Goal difference',
    how: 'The margin was right, even if the scoreline was not.',
  },
  total_goals: { label: 'Total goals', how: 'The combined goals were right.' },
  team_goals: {
    label: "One team's goals",
    how: 'You got one side exactly right. Consolation only — it does not pay when you nail the full scoreline.',
  },
  btts: {
    label: 'Both teams to score',
    how: 'You called whether both sides would score.',
  },
  first_team: {
    label: 'First-goal team',
    how: 'You called who would open the scoring. "No goals" counts in a goalless draw.',
  },
  first_scorer: {
    label: 'First scorer',
    how: 'You named the player who opened the scoring. Own goals never count — nobody wins this one on an own goal.',
  },
};
