# 6. Scoring, Leaderboard & Prize Architecture

## 6.1 Requirements → mechanisms map

| Requirement (brief) | Mechanism |
|---|---|
| Deterministic | Pure settlement functions `(prediction.value, market.outcome) → hits`, no clock/random/IO; ported semantics from `lib/scoring.ts` |
| Fully testable | Golden-vector suite seeded from the old repo's `scoring.test.ts` + property tests |
| Versioned | Immutable `rule_set_versions`; components record which version scored them |
| Transparent | Rules page renders from the DB rule set; every point traceable UI-side |
| Re-runnable | `score_runs` + upsert-by-natural-key components; reruns diff & log changes |
| Category breakdown | `score_components` one row per (user, market, category) |
| Different league weights | League binds a rule-set version; weights applied at aggregation from *hit* flags (old app's proven model, formalized) |
| Audited | run log + component `superseded_by_run` history + admin action audit |
| Idempotent | natural-key upserts; rerun of identical inputs is a no-op diff |
| No silent mid-season changes | versions immutable; league rebinding requires `effective_from_round` and creates a new version |

## 6.2 Two-phase scoring (carries the old app's best idea forward)

**Phase 1 — Settlement (global, league-independent).** When a fixture reaches `finished` (or a correction arrives), a score run settles each of its markets: compute `outcome`, then for every prediction compute **category hits** (booleans + any raw magnitude) via the market's settler. Hits are stored once, globally — exactly like the old `pts_*` columns but normalized and versioned.

**Phase 2 — Valuation (per league, at aggregation).** A league's bound rule-set version supplies weights per category; league totals = Σ(hit × weight) over enabled categories. Because hits are league-independent, changing a league's weights *for future rounds* never requires re-settlement; and Phase 1 reruns (provider corrections) automatically re-value every league.

Constraint made explicit (implicit in the old code): **Phase-1 categories must be all-or-nothing hits** for weight-swapping to be sound. If a future market needs graded points (e.g. "±1 goal near-miss = half"), model it as its own category with its own hit condition, not a fractional hit.

## 6.3 Structures (schema detail in `09-database-schema.md`)

- **`rule_sets`** — named family ("MatchDay Classic"). **`rule_set_versions`** — immutable: `version`, `definition jsonb` (per-category enabled/weight + settlement params like "team_exact_goals only when exact missed"), `engine_version` (code semver of the settlement library — captures logic changes, not just weights), `created_at`, `notes`. Seed v1 = old defaults (3/3/2/1/1/1/2/4).
- **`league_rule_bindings`** — league_season → rule_set_version, `effective_from_round`. History preserved; a league's season can span versions with a clean cut line. The league admin "weight editor" writes a *new version* + binding, never edits.
- **`score_runs`** — `id`, `trigger` (`auto_result|correction|manual|backfill`), `scope` (jsonb: fixture/round/season ids), `status`, `started/finished_at`, `stats jsonb` (markets settled, components written/changed), `initiated_by`, `error`. Concurrency: one active run per scope via lock (see ingestion doc).
- **`score_components`** — `user_id`, `market_id`, `category`, `hit boolean`, `raw jsonb` (e.g. actual first scorer for display), `rule_set_version_id` (the *default* settlement version), `score_run_id`, `superseded_by_run_id nullable`. Natural key `(user_id, market_id, category)` upserted; a correction rerun that changes a hit writes the new value and records the change in the run's diff log (`score_run_changes`: old/new per component) — this is the audit the old app lacked.
- **Provisional live points** are computed client/edge-side from `live` fixture state using the same pure settlers with the current score as if final — never written to `score_components` (only `finished` fixtures settle). UI always labels them provisional.

## 6.4 Leaderboards

- **Aggregation** is a ported+generalized `aggregateLeaderboard(components, weights, memberIds)`: per-user totals, per-category tallies, accuracy, streaks. The old canonical tiebreak chain carries over verbatim as v1 default (total pts → outcomes → exacts → GDs → … → submissions count last) [FACT source: `lib/leaderboard.ts` comment block]; the chain lives *in the rule-set version* so leagues could differ later.
- **Materialization:** compute on read for MVP scale (7–50 users × ≤380 fixtures × ≤8 categories is trivial for Postgres), but through a single SQL view/function so a cached `leaderboard_snapshots` materialization can be added without UI change. **`rank_snapshots`** (port) written after each round's settlement for movement arrows and the points-race chart.
- **Matchweek boards** = same aggregation filtered to the round's markets + that round's season-market events (none in MVP; season markets settle at season end and appear only on the overall board — decision logged).

## 6.5 Prizes

Replace hardcoded `lib/prizes.ts` (`PLAYER_COUNT=7`, fixed ±$ tables) with:

- **`prize_schemes`** per league_season: `kind` (`zero_sum_rank_table` | `pot_split` | `none`), `currency_label` (display only — the app **never moves money**; it's a ledger among friends), `definition jsonb`:
  - zero_sum_rank_table: `{ per_round: [amounts by rank], overall: [amounts by rank] }`, validated Σ=0 per table and length == league size at activation (league size changes after activation require organizer re-confirmation — edge the old app never faced with a fixed 7).
  - pot_split: `{ buy_in, splits: {overall: [..%], per_round?: [..%]} }`.
- **`prize_settlements`** ledger: `league_season_id`, `period` (`round n` | `overall`), `user_id`, `amount`, `settled_score_run_id`, `settled_at`, `revised_from nullable`. Written when a round fully settles / season completes. Corrections after settlement create *revision rows* (never silent edits) and surface a "prize ledger revised" feed event + notification — money disputes are the #1 trust risk; the ledger must show its history.
- Ties: [ASSUME, decision logged] split the summed amounts across tied ranks evenly (rounded to cents, remainder to better tiebreak) — must be confirmed with the group since old code used strict tiebreaks making ties near-impossible; v2 keeps the full tiebreak chain so true ties remain rare.
