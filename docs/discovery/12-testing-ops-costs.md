# 12. Testing Strategy, Observability & Infrastructure Costs

## 12.1 Testing strategy

**Pyramid:** heavy unit coverage on pure logic; targeted integration on DB security + normalizers; thin e2e on the money paths. All in CI on every PR (`pnpm check` = repo-check + lint + typecheck + unit + build; integration suite on PRs touching `supabase/` or `packages/`).

1. **Scoring golden vectors (highest value).** Port every case from old `lib/scoring.test.ts`, `leaderboard.test.ts`, `prizes.test.ts`, `gameweek-recap.test.ts`, `player-equivalence.test.ts` as fixtures `(prediction value, outcome) → expected components/totals`. Add: hedge overrides, `no_scorer` vs goalless, own-goal-first policy, void/abandoned fixtures, tie handling, weight re-valuation across rule versions. Add property tests (e.g. exact ⇒ outcome+GD+TG all hit; components stable under rerun).
2. **Settlement/rerun integration:** against local Supabase (`supabase start` in CI): score run → correction payload → rerun produces expected diff in `score_run_changes`, components idempotent, prize revision rows created.
3. **RLS & trigger tests (port the old approach — `lib/rls.integration.test.ts`, `launch-security.test.ts`):** execute the 8-item checklist in `10-security-and-rls.md` §10.4 with real anon/user JWTs against local Postgres. These run in CI, not just locally.
4. **Normalizer tests with recorded cassettes:** raw API-Football payloads (fixtures, events incl. weird ones — own goals, pens, VAR-disallowed, abandoned) checked into `packages/provider/test/cassettes/`; normalizers are pure so tests are fast and deterministic. Add a "correction pair" cassette (before/after provider revision).
5. **Job logic tests:** tick controller windowing (fixture proximity → which jobs fire), quota circuit breaker, lock contention (two concurrent invocations → one runs).
6. **E2E (Playwright, small):** signup → create league → join via code (second user) → submit matchweek → lock passes → simulate result → leaderboard reflects → recap renders. Run nightly + pre-release, not per-PR.
7. **Manual matchday drill before beta:** a scripted rehearsal against one real live PL-preseason/friendly day on the free provider tier.

## 12.2 Observability & operations

- **Structured logs** (JSON) in job routes with `sync_run_id` correlation; Vercel log drains optional later.
- **`/ops` health board** (screen 18) is the primary pane: job freshness (alert if `sync_live` stale >3 min during a live window; `sync_fixtures` stale >24h), quota gauge, failed runs, anomaly checks (unsettled finished fixtures >30 min, fixtures missing kickoff, markets past lock still 'open').
- **Alerting (MVP-simple):** a `notify_admin()` path reusing the push/email service to the platform admin for: job failure streak ≥3, quota ≥90%, anomaly checks failing, score run failed. No PagerDuty needed for 7 users.
- **Error tracking:** Sentry free tier for web + routes ([REC]; optional at beta).
- **Backups:** Supabase Pro daily backups + PITR option; **weekly restore drill** into a scratch project during Phase 1 once, then monthly. `raw_payloads` means even a scoring bug after backup horizon is recomputable.
- **Runbooks** in `docs/runbooks/`: provider outage (pause polls, banner), wrong result published (override + rerun + ledger revision comms), quota exhausted, Supabase incident, "member claims points wrong" (trace: prediction → components → run → raw payload).
- **Environments:** local (supabase CLI) → preview (Vercel preview + branch DB or shared staging schema — keep simple: one staging Supabase project) → prod. Seed scripts make a demo league with synthetic fixtures for previews.

## 12.3 Infrastructure & estimated monthly cost

| Item | Plan | Cost (verify current pricing) | Why |
|---|---|---|---|
| Supabase | **Pro** | **$25** | No project pausing (free tier pauses after inactivity — unacceptable for cron-driven prod), daily backups, pg_cron/pg_net, headroom |
| API-Football | **Pro** | **$19** | §7; subscribe at beta start; dev on free tier |
| Vercel | Hobby | $0 | Fits private beta (non-commercial personal use is the Hobby ToS line — the prize ledger among friends is fine; revisit if productized ⇒ Pro $20) |
| Resend (email) | Free | $0 | ~3k emails/mo tier covers reminders for ≤50 users |
| Domain | — | ~$1–2 amortized | |
| Sentry | Free | $0 | optional |
| **Total (beta)** | | **≈ $44–46/mo** | |
| Scale-up levers | Vercel Pro +$20; API-Football Ultra +$10; Supabase compute upgrades | ~$75–100/mo | public tier / many competitions |

Cost guardrails: quota ledger prevents surprise provider overage (API-Football hard-caps rather than bills overage — verify); Supabase egress monitored on `/ops` monthly.
