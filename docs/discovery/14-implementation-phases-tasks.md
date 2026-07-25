# 14. Implementation Phases & First 20 Engineering Tasks

## 14.1 Phases

- **Phase 0 — Foundations (wk 1–2):** repo scaffold, CI, baseline schema, auth, seed data, ported pure packages.
- **Phase 1 — Data spine (wk 2–5):** provider adapter, ingestion jobs, tick scheduler, `/ops` v0. Exit: PL 2026/27 fixtures/teams/squads live-updating with zero manual steps for a week.
- **Phase 2 — Predict & score (wk 4–8):** markets, prediction flows, locks, settlement engine, leaderboards. Exit: full simulated matchweek e2e green.
- **Phase 3 — Leagues & social (wk 7–10):** leagues, rule bindings, prizes, reveal, H2H, recap, feeds.
- **Phase 4 — Live & polish (wk 9–12):** live centre, match page live states, notifications, PWA, design pass.
- **Phase 5 — Beta hardening (wk 12–14):** security test suite, matchday drill, runbooks, seed the real league.

(Phases overlap by design for two developers: one on data spine while one builds predict/score against seed fixtures.)

## 14.2 First 20 engineering tasks (dependency order)

Each task = one PR-sized unit with listed dependencies and acceptance criteria (AC). Old-repo references use `../wc26-predictor/`.

1. **Scaffold repo & CI.** pnpm workspaces per §11.3; Next.js 15 app; Tailwind 4; Vitest; ESLint incl. import-boundary rules; port `scripts/repo-check.ts` (extended per §10.3); GitHub Actions running `pnpm check`. *Deps:* D1, D4. *AC:* empty app deploys to Vercel preview; CI green.
2. **Baseline database migration + local stack.** All tables/triggers/functions from `09-database-schema.md`; `supabase start` local; seed script for `market_types` + `rule_sets` v1 (old default weights). *Deps:* 1. *AC:* migration applies clean; immutability + lock triggers raise as specified in psql tests.
3. **Auth + profiles.** Supabase Auth (email/password + magic link), `profiles` creation on signup, session middleware (port `lib/supabase-*.ts`, `middleware.ts` patterns). *Deps:* 2. *AC:* signup/login/logout e2e; profile row auto-created.
4. **`packages/domain`.** Entity types + zod schemas for market values/outcomes per §5.2. *Deps:* 1. *AC:* typecheck across packages.
5. **Port `packages/scoring`.** Settlers ported from `../wc26-predictor/lib/scoring.ts` + `player-equivalence.ts` onto domain types; port `scoring.test.ts` vectors passing; add new-case vectors (own-goal, void). *Deps:* 4. *AC:* golden vectors green; zero-IO enforced by lint.
6. **Provider spike + cassette capture (timeboxed 2 days).** Free-tier API-Football key; capture raw cassettes for: PL fixtures list, one finished fixture (events/lineups/stats), one live snapshot, standings, squads, top scorers; verify goal-scorer+minute and lineup shapes; record findings in `docs/provider-notes.md`. *Deps:* 1. *AC:* cassettes committed; open questions from §13.4 answered or updated.
7. **`packages/provider` — adapter + normalizers.** `ProviderAdapter` interface; `ApiFootballAdapter`; pure normalizers with cassette tests; `provider_entity_map` resolution (create-on-first-see). *Deps:* 4, 6. *AC:* normalizer tests green incl. correction-pair cassette.
8. **`packages/jobs` core.** sync_runs (port `lib/sync-runs.ts`), advisory-lock helper, quota ledger + circuit breaker, raw payload writer, retry wrapper. *Deps:* 2, 7. *AC:* unit tests for lock contention + breaker.
9. **Season bootstrap job.** `sync_season_bootstrap` for PL 2026/27: competition/season/stage/rounds/teams/squads/fixtures into internal tables; markets auto-created per fixture + season markets. *Deps:* 8. *AC:* local DB shows 380 fixtures, 20 teams, MW rounds, markets with correct `locks_at`.
10. **Tick scheduler + fixture/live/lineups/final jobs.** `/api/jobs/tick` (bearer auth) + windowing controller; `sync_fixtures` (reschedule diffing), `sync_live`, `sync_lineups`, `sync_fixture_final` (+delayed correction re-checks); pg_cron + pg_net setup SQL. *Deps:* 8, 9. *AC:* simulated day (mocked adapter clock) drives status transitions scheduled→live→finished with events; reschedule test moves kickoff and locks follow.
11. **`/ops` v0.** Health board (sync_runs, quota, tick heartbeat, anomaly queries), targeted sync trigger, raw payload inspector; `requirePlatformAdmin`. *Deps:* 10. *AC:* checklist items visible; actions audited.
12. **Prediction API + lock enforcement tests.** Save/read predictions (composite fixture save → per-market rows), revision trigger verified, RLS + lock trigger integration tests (§10.4 items 1,2,6). *Deps:* 2, 3, 9. *AC:* security tests green in CI.
13. **Matchweek predict screen (screen 4).** Fixture cards, score steppers, advanced-market sheet (port interaction from `../wc26-predictor/components/PredictionModal.tsx`, decomposed), squad-search first-scorer picker, autosave, progress. *Deps:* 12. *AC:* mobile e2e: full MW submitted <3 min path works; locked rows read-only.
14. **Settlement engine + score runs.** Market outcome computation from fixture/events; score run orchestration (locks, components upsert, `score_run_changes` diff); wire `sync_fixture_final` → auto run; rerun-on-correction path. *Deps:* 5, 10, 12. *AC:* integration test: result → components; corrected result → expected diff rows; idempotent rerun no-ops.
15. **Leagues + membership + league_seasons.** Create league, `join_league(code)`, roles, enroll in PL season, reveal policy field; join flow UI (screens 2, 8 skeleton). *Deps:* 3. *AC:* two-user e2e join; RLS items 3,4 green.
16. **Rule bindings + league admin (screen 17).** Bind rule-set version; weight editor creating new versions with `effective_from_round`; rules page rendered from DB. *Deps:* 14, 15. *AC:* changing weights mid-season revalues only from chosen round; history intact.
17. **Leaderboards + snapshots.** Aggregation (port `../wc26-predictor/lib/leaderboard.ts` + test) over components×weights; overall + matchweek screens (9, 10); `rank_snapshots` post-settlement; movement arrows. *Deps:* 14, 16. *AC:* ported tiebreak tests green; boards match hand-computed fixture set.
18. **Season markets flow.** Entry UI (screen 14), lock at `first_kickoff_at`, live tracking display, settlement at season end (manual trigger acceptable MVP). *Deps:* 9, 12, 14. *AC:* picks lock correctly; tracking deltas render.
19. **Live centre + match page live states + provisional points.** Realtime/`live_cache` reads; provisional calculator reusing settlers; screens 5, 6 live phases. *Deps:* 10, 14. *AC:* simulated live day shows minute/score/provisional pts updating ≤90s.
20. **Notifications + PWA.** Port service worker, push subscribe, ICS feed; Resend email; `notification_prefs` + settings screen (20); deadline-reminder job (only-unpredicted logic ported from `../wc26-predictor/app/api/cron/kickoff-reminders`). *Deps:* 10, 13. *AC:* reminder fires for a test fixture at configured lead time on push + email, deduped on job retry.

**Then:** prizes engine + recap + H2H + activity feed (Phase 3 backlog), design polish, hardening (Phase 5), per §14.1.
