# 10. Security & RLS Model

Threat model for a private-friends product with money-adjacent stakes: the attacker is **a curious/competitive member**, not the internet. Priorities: (1) nobody can see hidden predictions early, (2) nobody can write predictions after lock, (3) nobody can alter scores/prizes, (4) provider secrets never leak, (5) everything sensitive is audited. The old app already learned lessons here — port them, don't rediscover them.

## 10.1 Roles

| Role | Grants |
|---|---|
| anonymous | landing/join preview only |
| authenticated member | own profile/predictions; league data for leagues they belong to |
| league organizer (`league_members.role`) | league settings, rule bindings (versioned), prize scheme, invites, member removal — via server routes checking `is_league_organizer()` |
| platform admin (`profiles.is_platform_admin`) | `/ops`, manual repairs, overrides — server routes only (port `lib/require-admin.ts` pattern) |
| service role | jobs, scoring, sync; bypasses RLS; **server-only env** (never `NEXT_PUBLIC_*`) |

## 10.2 RLS policy matrix (contract for the baseline migration)

| Table | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| football reference (competitions…standings, fixtures, events, lineups, stats, players) | authenticated read | service role only (no client writes at all — unlike old app where admin wrote matches via PostgREST; v2 admin writes go through server routes → service role, keeping policies minimal) |
| `profiles` | authenticated read (public fields via view if needed) | own row update; insert own on signup |
| `leagues` | **members only** + a SECURITY DEFINER `preview_league(code)` for the join flow (improvement over old "authenticated read all leagues"); `join_code` column excluded from the member-select via column privileges/view (ports hide-join-code fix `20260620000004`) | organizer update (name only); creation via server route |
| `league_members` | members of the same league | self-insert via `join_league()`; self-delete (leave); organizer delete (remove member) |
| `league_seasons`, `league_rule_bindings`, `prize_schemes` | league members | server routes (organizer-checked); bindings insert-only |
| `markets`, `market_types` | authenticated read | service only |
| `predictions` | **own rows always; others' rows only when** `market.status='locked' or 'settled'` **and** sharer+viewer share a league whose `reveal_policy` permits (ports migrations `20260620000001` + `_prediction_membership_scope`; policy implemented via SECURITY DEFINER helper `can_view_prediction(pred)` to avoid recursive RLS) | own insert/update while market open (RLS) **plus** `enforce_prediction_lock` trigger as the hard backstop; no delete policy (denied by default — old-app convention "scores are permanent") |
| `prediction_revisions` | own rows only | trigger-written only |
| `score_components`, `score_runs`, `score_run_changes` | components: visible when the underlying prediction would be visible (same helper); runs/changes: authenticated read (transparency) | service only; immutability triggers |
| `rule_sets`, `rule_set_versions` | authenticated read (rules page renders from here) | versions insert via server route; update/delete blocked by trigger |
| `prize_settlements` | league members | service only |
| `rank_snapshots`, `league_events`, `rivals` | league members (rivals: own rows) | service / own respectively |
| `push_subscriptions`, `notification_prefs`, `notification_log` | own rows | own rows (log: service only) |
| `raw_payloads`, `sync_runs`, `provider_quota_ledger`, `job_state`, `admin_audit_log`, `provider_entity_map` | **no client policies at all** (service + server routes only; `/ops` reads via server components with service client + `is_platform_admin` check) |

## 10.3 Non-RLS controls

- **DB-enforced kickoff locks** (trigger, §9.6) — the single most important control; regression-tested in CI (see testing doc) exactly like old `lib/launch-security.test.ts` / `rls.integration.test.ts`.
- **Server-side authorization helpers:** `requirePlatformAdmin()`, `requireOrganizer(leagueId)` (extend old `lib/require-admin.ts`); every mutating route uses one.
- **Cron/job route auth:** `Authorization: Bearer CRON_SECRET` constant-time compare (old pattern from `app/api/cron/kickoff-reminders`); job routes also verify source scope in payload.
- **Rate limiting:** replace old in-memory bucket (`lib/rate-limit.ts` — ineffective across serverless instances) with a Postgres-backed fixed-window counter (`rate_limits` table or Upstash Redis if latency matters later). Applied to: auth-adjacent routes, join-code attempts (prevent code brute force — codes also ≥10 chars, regenerable), admin actions, prediction save bursts.
- **Invite codes:** high-entropy, hidden from non-organizers, regenerable, join attempts rate-limited + logged.
- **Secrets isolation:** provider key, service role key, VAPID private key, CRON_SECRET, Resend key — server env only; repo-check script asserts no `SUPABASE_SERVICE_ROLE`/provider-key identifiers appear in client bundles (extend old `scripts/repo-check.ts`).
- **Audit:** `admin_audit_log` for every `/ops` and organizer mutation; `prediction_revisions` for users; `score_run_changes` for corrections; `prize_settlements.revised_from` chains for money.
- **Idempotent admin actions:** every `/ops` action takes the same advisory locks and upsert paths as automated jobs (shared code path requirement).
- **PII surface:** email only in auth schema; profiles expose username/avatar; account deletion anonymizes profile + keeps score rows under an "anonymized" user for league-history integrity ([ASSUME]; logged as a decision).
- **Realtime:** publication limited (§9.6) so no realtime channel can leak open predictions.

## 10.4 Security tests required before beta (definition of done)

1. Member A cannot read member B's prediction on an open market (direct PostgREST query).
2. A cannot write a prediction after `locks_at` (PostgREST direct write → trigger exception).
3. Non-member cannot read a league, its members, events, or settlements.
4. Member cannot read `join_code`; organizer can.
5. Anon/authenticated cannot read `raw_payloads`/`sync_runs`.
6. Reveal policies: `always` exposes pre-lock only within that league's member pairs; `at_kickoff` hides until locked.
7. Client bundle contains no server secrets (repo-check).
8. Job routes reject missing/bad bearer.
