# 8. Data Ingestion, Background Jobs & Notifications

## 8.1 Pipeline (brief-mandated flow)

```
API-Football  →  raw_payloads (archive, JSONB)  →  normalizers (adapter)  →  internal tables  →  app
                     │                                                          │
                 sync_runs / quota ledger                                  score_runs (on results)
```

- **Users/browsers never call the provider.** The provider key exists only in job-route env; no client bundle path imports the adapter (enforce with an ESLint boundary rule + repo-check).
- **Adapter contract** (`packages/provider` conceptually): `ProviderAdapter` interface with methods `fetchCompetitions/ fetchSeason/ fetchFixtures(seasonRef, window)/ fetchLive(seasonRef)/ fetchFixtureDetail(ref)/ fetchLineups(ref)/ fetchEvents(ref)/ fetchStandings/ fetchSquads/ fetchTopScorers/ fetchInjuries` returning **normalized DTOs** (internal shapes with provider refs attached). `ApiFootballAdapter` implements it; normalizers are pure and unit-tested against **recorded fixture cassettes** (raw payloads checked into test fixtures). ID resolution goes through `provider_entity_map` (create-on-first-see for teams/players with review queue for fuzzy cases).
- **Raw archive:** every provider response stored in `raw_payloads(provider, endpoint, params_hash, payload jsonb, fetched_at, status)` with a retention job (e.g. keep live-poll payloads 14 days, daily payloads 1 season; decision logged). Purpose: replays for corrections, normalizer regression tests, dispute forensics.

## 8.2 Sync job catalog

| Job | Cadence | Scope & notes |
|---|---|---|
| `sync_season_bootstrap` | manual/once per season | competitions, season, stages, rounds, teams, squads, full fixture list |
| `sync_fixtures` | 6h (daily windows) | fixture list diff → detects **reschedules** (kickoff/round changes), new/removed fixtures; emits `fixture_rescheduled` events → notifications |
| `sync_live` | dynamic, ≥1/min in-window | one league-scoped live call; updates score/minute/status/events; on transition to `finished` → enqueue `sync_fixture_final` |
| `sync_lineups` | every 5 min from T-90 to kickoff, per fixture-day | lineups+formation; on first availability emits `lineups_posted` |
| `sync_fixture_final` | on FT + re-check at FT+15m, +2h, +12h | final events/stats/scores; confirms result → triggers score run; the delayed re-checks catch **provider corrections** and re-run scoring if the payload materially differs (hash compare) |
| `sync_standings` | post-matchday + daily | table |
| `sync_top_scorers` | daily | Golden Boot table + season-market tracking |
| `sync_squads_players` | weekly + transfer-window daily | squad memberships |
| `sync_injuries` | daily 🔜 | optional surface |
| `retention_cleanup`, `quota_rollup`, `snapshot_ranks`, `send_reminders`, `generate_recaps` | daily/round-driven | housekeeping & product jobs |

**Dynamic polling controller:** a single `tick` job runs every minute; it reads a `job_schedule` view (fixtures today? any in `live`? lineups window open?) and dispatches only the jobs whose window is active. Outside match windows the tick does nothing (≈1 provider call per 6h). This satisfies "dynamic polling frequency based on fixture proximity" with one simple scheduler entry.

## 8.3 Reliability mechanics

- **Locks:** Postgres advisory locks per job key (`pg_advisory_xact_lock(hashtext('sync_live:PL'))`) taken by the job route — cheap, no extra infra, safe across concurrent invocations. (Old app only had a per-process guard, `lib/once.ts`.)
- **Idempotency:** all writes upsert on natural keys (provider map → internal id); event rows keyed by (fixture, provider_event_id | ordinal hash); score runs idempotent per `06-…`. A retried job re-produces identical state.
- **Retries:** in-route bounded retry (3× exponential backoff) for transient provider/network errors; failures recorded in `sync_runs` with `error_summary` (port `describeSyncError` from old `lib/sync-runs.ts`) and surfaced on `/ops`; the next scheduled tick is the retry-of-last-resort.
- **Quota:** `provider_quota_ledger` increments per call (the adapter also reads API-Football's remaining-quota response headers as ground truth); circuit breaker pauses non-critical jobs at 80% and everything but live at 90%, alerting admin.
- **Duplicate-scoring protection:** score runs take the fixture advisory lock; components upsert by natural key; `sync_fixture_final` only triggers a run when the confirmed-result hash changes.
- **Manual repair:** `/ops` actions (targeted sync, result override, rescore-with-diff-preview) + a small CLI (`pnpm ops …`) for emergencies — parity with the old scripts but against the same job routes, not separate code paths.

## 8.4 Scheduling options compared (brief-mandated)

| Option | Effort | Cost | Reliability | Notes |
|---|---|---|---|---|
| **Vercel Cron** | Low | Needs **Pro ($20/mo)** for per-minute crons (Hobby is limited to low-frequency daily-class crons — verify current limits) | Good; at-least-once, no retries | Simple but pay $20/mo mainly for a scheduler |
| **Supabase `pg_cron` (+ `pg_net` HTTP)** | Low | **$0 extra** (included in the Supabase Pro plan we need anyway) | Good; cron inside the DB we already trust; per-minute supported | Calls our Next.js job route with `Authorization: Bearer CRON_SECRET`. Monitoring via `cron.job_run_details` surfaced on `/ops` |
| Upstash QStash | Low-Med | Free tier likely sufficient; paid ~$1+ | **Best** delivery semantics (retries, DLQ, signatures) | Adds a vendor; great targeted upgrade if pg_cron→HTTP proves flaky |
| Dedicated worker (Railway/Fly) | Med-High | ~$5–10/mo | High, most control | Second deployable + ops burden; overkill for a 1-min tick at this scale |

**[REC] Supabase `pg_cron` → `pg_net` → Next.js `/api/jobs/tick` (secret-authenticated), one-minute schedule + a few daily entries.** Rationale: zero added cost/vendors, keeps *all* sync logic in the one TypeScript codebase (shared types with the app and tests), and the tick pattern keeps schedules trivial. Vercel Hobby function limits (≤60s configurable) are respected by designing every job invocation to be small (live tick <5s; bootstrap/backfill jobs are chunked and self-re-enqueue via the next tick). **Documented fallback:** if pg_net delivery proves unreliable in practice, swap the dispatch edge to QStash (schedule → same route) — a one-file change by design.

## 8.5 Notifications

- **Channels:** Web Push (port `worker/index.ts`, `push_subscriptions`, VAPID via `web-push`) + Email (Resend) + in-app activity feed. Per-user, per-type preferences (`notification_prefs`) honoured by a single `notify(userIds, type, payload)` service that fans out to enabled channels and logs to `notification_log` (dedupe key prevents double-sends on retried jobs).
- **MVP notification types:** `deadline_reminder` (configurable lead time; only when user has unpredicted fixtures — port of `kickoff-reminders` logic), `lineups_posted` (only if user's first-scorer pick is affected or opted-in), `fixture_rescheduled` (if moved earlier and unpredicted), `round_settled` (+ my points), `recap_ready`, `prize_ledger_revised`.
- **ICS calendar feed** per user token (direct port of `lib/ics.ts` + `app/api/calendar/[token]`), now generated from `fixtures`.
- Reminder scheduling rides the same tick (job checks upcoming kickoffs against prefs) — no separate scheduler.
