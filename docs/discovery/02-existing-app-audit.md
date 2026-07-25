# 2. Audit of the Existing Repository (`calebsooon/wc26-predictor`)

All statements tagged [FACT] were verified by reading the cloned source (2026-07-17, default branch, 278 files).

## 2.1 Shape of the codebase

[FACT]
- ~26,900 lines of TypeScript/TSX; 2,589 lines of SQL across **51 migrations** in `supabase/migrations/`; 13 Vitest test files; `package.json` name is already `matchday`.
- Next.js 15 App Router + React 18, Supabase (`@supabase/ssr`, `supabase-js`), `@ducanh2912/next-pwa`, `web-push`, `framer-motion`, `sonner`, Tailwind 3, Vitest 4, deployed on Vercel (`vercel.json`, crons array empty).
- Structure: `app/` (21 pages, 20 API routes), `components/` (22 shared components), `lib/` (35 modules + tests), `scripts/` (11 CLI data/ops scripts), `supabase/migrations/`, `worker/index.ts` (push service worker), `docs/` (screenshots, architecture diagrams), 827-line README.

### Pages [FACT — `find app -name page.tsx`]
`/` (landing), `/login`, `/join`, `/install`, `/dashboard`, `/predictions`, `/match/[id]`, `/leaderboard`, `/bracket`, `/bracket-leaderboard`, `/groups`, `/golden-boot`, `/squads`, `/h2h`, `/recap`, `/profile`, `/admin`, `/rules`, `/faq`, `/privacy`, `/terms`, `/offline`.

### API routes [FACT]
Scoring: `score-match`, `score-groups`, `score-tournament`, `rescore-all`, `snapshot-ranks`. Data: `sync-results`, `sync-events`, `fetch-lineup`, `golden-boot`, `teams`, `teams/[code]`, `live-status`, `admin/fifa-health`. UX: `recap`, `calendar/[token]`, `push/subscribe`, `push/send`, `cron/kickoff-reminders`, `telemetry`, `auth/callback`.

### Largest UI modules [FACT — `wc -l`]
`app/admin/page.tsx` 1,774 · `components/PredictionModal.tsx` 1,239 · `app/match/[id]/page.tsx` 1,080 · `app/dashboard/page.tsx` 1,007 · `app/predictions/page.tsx` 802 · `components/MatchLineups.tsx` 589. These are large client components mixing data fetching, state and rendering — a pattern to avoid in v2 (see §4.6).

## 2.2 How the current system works (verified flows)

### Scoring [FACT — `lib/scoring.ts`, 249 lines]
- Seven fixture categories with fixed default points: outcome +3, exact +3 (stacked on outcome), goal difference +2, total goals +1, "a team's exact goals" +1 (consolation, only when exact missed; **off by default**, leagues opt in), BTTS +1, first-goal team +2, first scorer +4.
- `scorePrediction(pred, match)` is a **pure function** returning a `ScoreBreakdown`; hedging is supported — users can override goal-diff/total-goals/BTTS independently of their scoreline (`pred_goal_diff ?? (ph - pa)` etc.).
- First-scorer handles `pred_no_scorer` (correct only when result confirms `first_goal_team === 'NONE'`) and **equivalent player IDs** (duplicate player records from different sources count as the same scorer — `lib/player-equivalence.ts` + `lib/score-sync.ts`).
- **Key design:** category hits are stored per prediction as `pts_*` columns at default weights; each league re-weights hits at read time via `weightedMatchPoints(breakdown, weights)` — "the same prediction can be worth different amounts in different leagues without re-storing points" (comment at `lib/scoring.ts:54-60`). Group predictions: +2 per correct finishing position. Bracket: R32 1 / QF 2 / SF 3 / runner-up 5 / champion 10.

### Scoring execution [FACT — `lib/score-sync.ts`]
`scoreMatchPredictions(service, matchId)` loads the match result, loads all predictions for that match, computes breakdowns, and **upserts** on `(user_id, match_id)` — naturally idempotent and re-runnable; `app/api/rescore-all/route.ts` replays every finished match. But: no run log, no rule versioning, no audit of what changed between runs (see §4.3).

### Leaderboards [FACT — `lib/leaderboard.ts`, 181 lines]
Single aggregation function shared by dashboard mini-table and full leaderboard ("single source of truth" per header comment). Canonical tiebreak chain: total points → correct outcomes → exact scorelines → goal differences → … → predictions submitted last (documented in code to match the Rules page). Computed on demand from prediction rows in the client/server — **no persisted leaderboard**; `rank_snapshots` table stores per-league rank history for movement arrows (`lib/snapshot.ts`, `app/api/snapshot-ranks/route.ts`).

### Leagues [FACT — migration `20260611000004_leagues.sql`, `lib/league.ts`]
- Predictions are **global per user per match**; a league is a member grouping that produces its own leaderboard (explicit in `lib/league.ts` header comment). This matches the brief's MVP assumption and is validated in production.
- `leagues` has `join_code` (unique), `type` money|points, `scoring jsonb` (weight overrides), plus later flags: `reveal_predictions` (migration `20260612000001`), `prize_pool`, `banners_enabled`, `bracket_enabled`, `label_id`. `join_league(code)` is a SECURITY DEFINER function. Join code exposure was later locked down (migration `20260620000004_hide_join_code.sql`).
- A 20-second client-side league cache avoids request bursts on navigation (`lib/league.ts`).

### Kickoff locking [FACT — migration `20260624000000_lock_prediction_writes.sql`]
Database-level BEFORE INSERT/UPDATE triggers reject end-user prediction writes when `is_locked OR real score published OR match_date <= now()`; service-role writes bypass (needed for rescoring). The migration comment explicitly records the prior vulnerability (UI-only enforcement allowed PostgREST writes after kickoff). **This is a hard requirement to preserve in v2.**

### Data ingestion [FACT — `scripts/sync-fifa-matches.ts`, `lib/fifa-client.ts`, `lib/sync-runs.ts`]
- Provider is FIFA's **GameDay API** (unofficial: token endpoint + `gameday-prod.fifa.mangodev.co.uk`, hardcoded `FIFA_SEASON_ID='285023'`, spoofed browser User-Agent). Modes: fixtures/lineups/stats/all, plus `sync-events.ts`, `sync-golden-boot.ts`, `sync-fifa-teams.ts`.
- Sync is **CLI-first, run manually** ("FIFA match data is intentionally refreshed from a trusted local machine with `npm run data:fifa:daily`" — [FACT] comment in `.github/workflows/live-data.yml`, whose only job is a manual-dispatch reminder ping). `vercel.json` crons: `[]`.
- Good bones exist: `sync_runs` table with kind/trigger/status/records read+written/error summary (`lib/sync-runs.ts`); `fifa_raw_snapshots` raw payload table [FACT: in migration table list]; `DRY_RUN=1` support; `admin/fifa-health` endpoint; scoring is invoked from sync when results land (imports `scoreMatchPredictions` + `snapshotLeagueRanks`).
- Supporting enrichment: Wikidata player enrichment (`scripts/fetch-wikidata-players.ts`), team crest caching to Storage (`scripts/cache-team-crests.ts`).

### Database [FACT — `create table` grep across migrations]
29 tables: `rounds`, `matches`, `profiles`, `predictions`, `players`, `lineups`, `lineup_substitutions`, `group_predictions`, `tournament_predictions`, `bracket_results`, `leagues`, `league_members`, `league_labels`, `league_banners`, `league_events`, `rank_snapshots`, `scoring_events`, `push_subscriptions`, `match_events`, `match_participants`, `match_team_stats`, `match_player_stats`, `match_formation_changes`, `golden_boot_stats`, `fifa_teams`, `fifa_player_stats`, `fifa_raw_snapshots`, `live_cache`, `sync_runs`.
- `matches`: `home_team text`, `away_team text` — teams are **strings, not entities** (initial schema). `matches.gw_number` 1–8 added later; `provider_fixture_id` was added then **dropped** (migration `20260623000000_drop_provider_fixture_id.sql`) when FIFA became the sole source. 

### Security [FACT]
RLS on all tables from the first migration; `is_admin()` SECURITY DEFINER helper; predictions have no DELETE policy (deletes denied by default — "scores are permanent"); `lib/require-admin.ts` guards admin routes server-side; `lib/rate-limit.ts` is an **in-memory per-process token bucket** (10 req/min) — resets on redeploy and is per-instance, i.e. not a real limit on Vercel's multi-instance serverless (see §4.5); audit hardening + "launch security" migrations (`20260619000000`, `20260620000000`) tightened read policies (predictions hidden until kickoff unless league reveal flag: migrations `20260620000001`, `_prediction_membership_scope`); calendar feeds use per-user tokens (`20260619000002_calendar_token.sql`); `lib/launch-security.test.ts` and `lib/rls.integration.test.ts` exist.

### PWA / notifications [FACT]
`worker/index.ts` handles push display + click-through; `push_subscriptions` table; `app/api/cron/kickoff-reminders/route.ts` sends pre-kickoff reminders (triggered externally with `CRON_SECRET` bearer auth); `/install` page; offline shell at `/offline`; ICS calendar feed (`lib/ics.ts`, tokenized route).

### Quality tooling [FACT]
`npm run check` = repo-check (custom `scripts/repo-check.ts`) + lint + typecheck + vitest + production build. Tests cover: scoring, leaderboard, prizes, recap, golden boot, lineup layout/state/validation, league read, player equivalence, once-guard, launch security, RLS integration.

## 2.3 Reusable assets (what carries into v2)

| Asset | Files | Reuse mode |
|---|---|---|
| Pure scoring functions + hedge semantics + no-scorer + player equivalence | `lib/scoring.ts`, `lib/player-equivalence.ts`, tests | **Extract & generalize** — becomes the fixture-market settlement library inside the new versioned engine; existing tests become golden vectors |
| Score-once/re-weight-per-league model | `lib/scoring.ts` §weights, `leagues.scoring jsonb` | **Concept carries** into rule-set versions + score components |
| Leaderboard aggregation + tiebreak chain | `lib/leaderboard.ts` + test | **Extract & generalize** (drop WC bracket/group inputs; add market-generic components) |
| DB-enforced kickoff locks | migration `20260624000000` | **Port pattern directly** (trigger against `fixtures.kickoff_at`/status) |
| RLS policy patterns incl. reveal-at-kickoff and membership scoping | migrations `20260609…`, `20260620000001/2`, `lib/rls.integration.test.ts` | **Port patterns**, rewrite for new tables |
| Sync-run logging + dry-run + raw snapshots | `lib/sync-runs.ts`, `fifa_raw_snapshots` | **Port & extend** (add quota ledger, locks, scheduling) |
| Push pipeline + reminder cron + ICS feed | `worker/index.ts`, `lib/push.ts`, `app/api/push/*`, `lib/ics.ts`, `app/api/calendar/[token]` | **Reuse largely unchanged** |
| League join-by-code incl. SECURITY DEFINER join + hidden codes | migration `20260611000004`, `20260620000004`, `app/join` | **Reuse pattern** |
| PWA config + offline shell + install page | `next.config.mjs`, `app/offline`, `app/install` | **Reuse largely unchanged** |
| Formation pitch, lineups, match facts UI | `components/FormationPitch.tsx`, `MatchLineups.tsx`, `MatchFacts.tsx`, `lib/lineup-*` | **Reuse with re-skin**; lineup layout logic is provider-agnostic math |
| Recap generation + share cards | `lib/gameweek-recap.ts` (422 lines) + `components/RecapShareActions.tsx` | **Extract & generalize** (gameweek → round) |
| H2H, points-race charts, rank snapshots | `app/h2h`, `components/charts.tsx`, `lib/snapshot.ts` | **Reuse with adaptation** |
| Repo-check/CI discipline (`npm run check`) | `scripts/repo-check.ts`, workflow | **Port** |
| Prize zero-sum concept | `lib/prizes.ts` + test | **Rewrite** as configurable prize schemes (currently hardcoded: `PLAYER_COUNT=7`, `GW_PRIZES=[15,10,5,0,-5,-10,-15]`, `OVERALL_PRIZES=[40,20,10,0,-10,-20,-40]`) |

## 2.4 Technical debt & tournament-specific assumptions (why not to refactor in place)

1. **Teams/players are not entities.** `matches.home_team` is text; team pages key off FIFA team codes (`app/api/teams/[code]`); `first_goal_team` compares strings, with `'NONE'` as a sentinel. Every downstream module (scoring, lineups, recap, golden boot) assumes this. Fixing it in place touches nearly every file and all 51 migrations' worth of accumulated shape.
2. **Tournament structure is hardcoded.** `gw_number ∈ 1..8` with names in `lib/prizes.ts` (`GW_NAMES`: "Group Stage — Day 1" … "Final & 3rd Place"); dedicated `group_predictions`, `tournament_predictions`, `bracket_results`, `bracket_phases` tables; bracket points constants in `lib/scoring.ts`. None of it maps to a 38-matchweek league season.
3. **Prize model hardcodes 7 players and 8 gameweeks** (`lib/prizes.ts:1-5`). The brief requires configurable prize rules.
4. **Prediction storage is column-per-market.** `predictions` grew columns per market (`pred_first_goal_team`, `pred_btts`, `pred_no_scorer`, … across migrations `20260611000003`, `20260612000000`). Adding a market = migration + form + scoring change in lockstep. v2 needs the generic market model.
5. **Scoring is not versioned or audited.** Default points are compile-time constants; `pts_*` columns are overwritten in place on rescore with no run record of before/after; league weight edits at any time silently re-value history (violates the brief's "rules should not be silently changed after a season begins"). The weighted re-read also **quantizes to hit/no-hit** (`(p.pts_outcome ?? 0) > 0 ? w.outcome : 0`), which works only because categories are all-or-nothing — a constraint to make explicit in v2.
6. **Provider debt.** FIFA GameDay is unofficial (reverse-engineered endpoints, spoofed UA, hardcoded season ID) and single-tournament; sync is manual-from-laptop; `provider_fixture_id` was dropped so there's no stable external mapping; per-provider tables (`fifa_teams`, `fifa_player_stats`) leak the provider into the schema. Events parsing does string surgery on tag names (`lib/fifa-client.ts` goal-tag parsing) — brittle by nature.
7. **Operational gaps.** In-memory rate limiter (ineffective on serverless); no distributed locks around sync (only `lib/once.ts` per-process guard [INFER from name + test]); no quota tracking (irrelevant for FIFA, mandatory for a metered provider); Vercel crons unused; reminders depend on someone clicking a GitHub Action.
8. **Documentation drift** is acknowledged in the brief and plausible [INFER]: README scoring badges ("max 16 pts") vs. `teamGoals` default-off behaviour is the kind of mismatch that versioned rule sets displayed from the DB will eliminate (rules page should render from the rule set, not hand-written text).
9. **Monolithic page components** (§2.1 sizes) mix concerns; v2 should split server components/data loaders from client interaction and keep files under ~300 lines.
10. **Migration history is exploratory.** 51 migrations include reversals (add then drop `provider_fixture_id`), fix-ups (`fix_golden_boot_replace`, `optimize_golden_boot_replace`) — fine for a project that evolved live during a tournament, but a fresh baseline schema is cleaner to reason about, and old data does not need to migrate (WC26 history can stay in the old app, kept read-only as an archive; [ASSUME] confirmed as acceptable — listed in decisions).

## 2.5 Conclusion

The old app's *logic* (scoring semantics, tiebreaks, lock enforcement, reveal rules, recap math) is battle-tested and worth porting with its tests. The old app's *data model and pipeline* are World-Cup-shaped and should not survive. This drives the repo strategy recommendation in `11-repo-strategy.md`.
