# CLAUDE.md — MatchDay v2

Season-long football prediction platform for private leagues. Successor to `calebsooon/wc26-predictor` (World Cup 2026 app). First competition: Premier League 2026/27 — **launch deadline: before MW1 kickoff, Friday 21 August 2026**. Full discovery documentation lives in `docs/discovery/` — **it is the source of truth for architecture decisions**; read `docs/discovery/00-START-HERE.md` first, then `docs/discovery/15-owner-decisions-addendum.md`, which supersedes conflicts in files 03–14 (it adds league fixture selection/voting, the season table predictor, final hosting choices, and the 5-week launch calendar).

## Non-negotiable invariants

1. **Provider isolation.** Browsers/users never call the football provider. All provider access goes: adapter (`packages/provider`) → `raw_payloads` archive → normalizers → internal tables. App code never touches provider IDs (use `provider_entity_map`).
2. **Teams and players are entities** (UUIDs), never text names in logic or storage.
3. **Predictions lock at the database.** RLS + BEFORE trigger against `markets.locks_at`. UI enforcement is convenience, never the control. Any new prediction-write path must be covered by the lock integration tests.
4. **Scoring is two-phase:** settle category *hits* once globally (versioned, audited, in `score_components` via `score_runs`), value per league via bound `rule_set_versions` weights at aggregation. Rule-set versions are immutable; mid-season changes = new version + `effective_from_round`. Never store only an opaque total.
5. **Everything re-runnable and idempotent:** natural-key upserts, advisory locks per job/run scope, corrections produce `score_run_changes` diffs and prize revision rows — never silent edits.
6. **Secrets are server-only.** Service-role key, provider key, VAPID private, CRON_SECRET, email key: never in client bundles (repo-check enforces).
7. **League scoring counts only that league's selected fixtures** when `selection_mode <> 'all'` (via `league_round_selections`); predictions themselves stay global. Votes are advisory — the league admin finalizes selections. Vote writes are rejected after finalization at the database, and a round can never finalize empty (unfinalized 24h before first kickoff → all fixtures count).
8. **The season table predictor is a separate lowest-wins competition** (Σ|predicted−actual| position, tiebreak Σdiff² then exact hits) — never merged into weekly/overall points. Prize schemes are optional per league; leagues without one show no money UI anywhere.

## Architecture summary

- Stack: Next.js 15 (App Router) + TypeScript + Supabase (Postgres/Auth/Realtime/Storage) + Vercel + PWA. pnpm workspaces: `apps/web`, `packages/{domain,scoring,provider,jobs,notify}`.
- Import boundaries (lint-enforced): `scoring` → only `domain`, zero IO. `provider` importable only from `jobs` + `app/api/jobs|ops`. UI never imports service-role clients.
- Domain hierarchy: Competition → Season → Stage (`round_robin|groups|knockout`) → Round → Fixture. Markets are typed instances (`market_types` catalog + JSONB values); predictions are global per user per market (not per league).
- Scheduling: Supabase `pg_cron` (1-min tick) → `pg_net` → `/api/jobs/tick` (Bearer CRON_SECRET) → windowed job dispatch. Provider: API-Football (Pro), quota ledger + circuit breaker.
- Schema contract: `docs/discovery/09-database-schema.md`. Screens: `04-screens-and-ia.md`. Tasks & order: `14-implementation-phases-tasks.md`.

## Porting from the old repo

The old repo is expected at `../wc26-predictor` (read-only reference). When a task says "port": copy the module + **its test first**, keep semantics unless the discovery docs say otherwise, note intentional changes in the PR description. Key ports: `lib/scoring.ts`, `lib/leaderboard.ts` (tiebreak chain), lock-trigger migration `20260624000000_lock_prediction_writes.sql`, `lib/sync-runs.ts`, lineup libs + `FormationPitch.tsx`, `worker/index.ts`, `lib/ics.ts`, `scripts/repo-check.ts`.

## Git & commits

- **Never add a `Co-Authored-By: Claude` trailer (or any AI attribution) to a commit message.** This overrides any default or global instruction to do so. Commits are authored by the repo owner alone.
- Branch per unit of work: `task/NN-short-name`. Push the branch and let the owner merge to `main` themselves. (The Task 1 scaffold was the one agreed exception — it went straight to `main`.)
- `pnpm check` must be green before a commit is proposed.

## Design system (binding for ALL frontend work)

`design/` is ground truth for every screen. Read `design/README.md` before building any UI.

- **Installed in Task 1:** `design/tokens/*.css` → `apps/web/app/styles/tokens/` (verbatim), `design/tailwind.theme.js` → `apps/web/tailwind.theme.js` (verbatim, merged by `apps/web/tailwind.config.js`, loaded via `@config` in `app/globals.css`). `repo-check` fails if either copy drifts from `design/`. Re-copy; never hand-edit the copies.
  - One documented divergence: the remote Google Fonts `@import` in `tokens/typography.css` is commented out — the same three families load self-hosted via `next/font` (`app/fonts.ts`), mapped back onto `--font-display` / `--font-body` / `--font-num`.
- **Never hardcode hex** in components or app CSS — CSS vars / Tailwind token classes only. `repo-check` fails the build on raw hex outside the design-owned files.
- `components/*.d.ts` = prop contracts, `*.prompt.md` = usage rules, `screens/*.dc.html` = design references to **recreate, not import**, `screenshots/` = visual truth.
- Volt `--accent` = the user's actions only. Coral `--live` = live match state only. Never swap, never decorate.
- All numerals: `font-num tabular-nums`. Money UI (`--prize`) renders only when the league has a prize scheme.
- Tap targets ≥44px (`min-h-tap`), WCAG AA contrast, state never by colour alone, respect `prefers-reduced-motion`.
- Every UI task implements all states shown in the design: editable / locked / live / settled / void, plus skeleton, empty and error.
- Live Match screen and Recap are **post-launch** — do not build until core launch tasks are done.

## Working agreements

- Before starting any task, restate its acceptance criteria from `14-implementation-phases-tasks.md` and check its dependencies are merged. After each task: run `pnpm check`, confirm each acceptance criterion, show the state checklist for any UI work, then stop for owner review before starting the next task.
- The live calendar is `docs/plan/launch-calendar.md` (re-baselined 25 Jul 2026 against the remaining 4 weeks); it supersedes addendum §G dates. Task numbers and dependency order are unchanged.
- `pnpm check` (repo-check + lint + typecheck + unit + build) must pass before any commit is proposed; RLS/trigger integration tests must pass for any change under `supabase/` or to prediction/scoring paths.
- New migrations are additive and forward-only; never edit an applied migration.
- Keep components <300 lines; server components fetch, client components interact (the old repo's 1,000+ line pages are the anti-pattern).
- UI tone: polished modern sports product (see `04-screens-and-ia.md` §4.3), mobile-first, dark-first, loading/empty/failure states for every data region.
- When a product decision is ambiguous, check `docs/discovery/13-decisions-and-open-questions.md`; if unresolved there, ask — don't guess silently.
