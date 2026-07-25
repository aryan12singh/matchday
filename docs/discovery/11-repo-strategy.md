# 11. Repository Strategy, Module Structure & Code-Reuse Plan

## 11.1 Three approaches assessed

| | 1. Refactor in place | 2. Fork & strip | 3. Clean repo, port modules |
|---|---|---|---|
| Dev effort | Deceptively high — 51 migrations of WC-shaped schema must be migrated live; text-team model touches everything (audit §2.4.1) | Medium start, high tail — inherits all debt, deletes ~60% of code, git history becomes noise | Medium — rebuild shell, but port logic with tests |
| Risk to running WC app/archive | High (same repo/db) | None | None; old app stays as read-only archive |
| Schema quality | Compromised (migration-of-migrations) | Compromised | **Clean baseline** designed for the target model |
| Cognitive load for 2 devs | Constant "is this WC legacy?" | Same | Everything present is intentional |
| Code reuse | Max | High | High **where it matters** (pure logic + patterns) |

**[REC] Approach 3 — clean repository (`matchday`), selective porting.** The reusable value is concentrated in pure logic modules and SQL *patterns* (audit §2.3), which port cheaply; the expensive parts (schema, sync, prediction storage) must change anyway. Keep `wc26-predictor` untouched as the WC26 archive. No data migration ([ASSUME] confirmed acceptable — decision logged; if WC history import is ever wanted, it's an ETL into the generic model as competition "World Cup 2026").

## 11.2 Module disposition (brief-required review list)

| Old module | Disposition | Notes |
|---|---|---|
| Scoring engine `lib/scoring.ts` (+ test) | **Extract & generalize** | Pure settlers → `packages/scoring`; tests become golden vectors; weights move to rule-set versions |
| Leaderboard `lib/leaderboard.ts` (+ test) | **Extract & generalize** | Keep tiebreak chain; inputs become score components |
| Prizes `lib/prizes.ts` | **Rewrite** | Hardcoded 7-player/8-GW tables → prize schemes (§6.5); keep formatting helpers |
| Prediction forms `components/PredictionModal.tsx` (1,239 lines), `PlayerCardPicker.tsx`, `app/predictions/page.tsx` | **Rewrite UI, port interaction design** | Same UX ideas (hedges, scorer picker, autosave), decomposed components, market-driven rendering |
| League membership `lib/league.ts`, `join_league`, hide-code migration | **Port pattern** | Add roles + league_seasons |
| RLS policies (all migrations) | **Port patterns, rewrite policies** | See §10; keep SECURITY DEFINER helper style, reveal semantics, no-delete predictions |
| Kickoff lock trigger `20260624000000` | **Port directly** (retarget to markets) | Highest-value single migration in the old repo |
| PWA config `next.config.mjs`, `worker/index.ts`, `/install`, `/offline` | **Reuse largely unchanged** | |
| Realtime subscriptions + `live_cache` pattern | **Port pattern** | Narrowed publications (§9.6) |
| Match Centre `app/match/[id]`, `MatchFacts`, `charts` | **Rewrite screens, reuse components selectively** | Data now entity-based |
| Lineup layout `lib/lineup-layout.ts` (+3 lineup libs, tests), `FormationPitch.tsx`, `MatchLineups.tsx` | **Reuse largely unchanged** | Provider-agnostic geometry/math; adapt input types |
| Recaps `lib/gameweek-recap.ts` (+ test), `RecapShareActions.tsx` | **Extract & generalize** | gameweek→round; inputs = components |
| Admin tooling `app/admin/page.tsx` (1,774 lines) | **Rewrite** as `/ops` + league admin split | Old page mixes platform + league admin |
| FIFA sync `scripts/sync-fifa-*.ts`, `lib/fifa-client.ts`, `lib/events-sync.ts` | **Retire** | Replaced by adapter + jobs; keep as reference for event-shaping edge cases |
| `lib/sync-runs.ts` | **Port & extend** | + quota, locks, tick |
| Wikidata/crest scripts | **Retire** (provider supplies images/data) | |
| DB migrations (51) | **Retire**; new baseline | Patterns mined per above |
| Tests (13 files) | **Port** scoring/leaderboard/prizes/recap/lineup/RLS as vectors & templates | |
| `scripts/repo-check.ts`, `npm run check`, setup-check, grant-admin | **Port** | Extend repo-check with adapter/client boundary rules |
| Calendar/ICS, push libs, telemetry, url-state, date-format, prefs, hooks, ui primitives | **Port with light edits** | |

## 11.3 New repository structure

Single Next.js app + internal packages via npm/pnpm workspaces — **not** microservices (brief constraint: manageable for two developers). Packages exist for *boundary enforcement*, not deployment separation.

```
matchday/
├── CLAUDE.md                    # from this pack
├── docs/discovery/              # this pack
├── apps/web/                    # Next.js app (only deployable)
│   ├── app/
│   │   ├── (public)/            # landing, login, join, install, legal
│   │   ├── (app)/               # home, predict, live, match, table, teams, league/*, profile, settings
│   │   ├── (ops)/ops/           # platform admin
│   │   └── api/
│   │       ├── jobs/tick/       # pg_cron entry (bearer-auth)
│   │       ├── jobs/[job]/      # individual job routes (bearer-auth)
│   │       ├── ops/*            # admin actions (requirePlatformAdmin)
│   │       ├── league/*         # organizer actions
│   │       ├── push/* calendar/[token]/ ...
│   ├── components/              # design-system/ + feature components
│   └── lib/                     # app glue only (supabase clients, auth, prefs)
├── packages/
│   ├── domain/                  # TS types for all entities; zod schemas for market values
│   ├── scoring/                 # pure settlers + aggregation + tiebreaks (ZERO IO) ← ported
│   ├── provider/                # ProviderAdapter interface + ApiFootballAdapter + normalizers
│   ├── jobs/                    # job implementations, tick controller, locks, sync-runs, quota
│   └── notify/                  # notification service + templates
├── supabase/
│   ├── migrations/              # new baseline + increments
│   └── seed/                    # market_types, rule_sets v1, dev fixtures
├── tests/                       # integration (RLS, triggers), e2e later
└── scripts/                     # repo-check, setup-check, ops CLI
```

Boundary rules (enforced by ESLint import rules + repo-check): `scoring` imports nothing but `domain`; `provider` never imported by `apps/web/app/(app|public)` (only by `jobs` and job routes); components never import `provider` or service-role clients.

## 11.4 Porting workflow for Claude Code

For each "port" module: (1) copy the old file(s) from `../wc26-predictor/...` into the target package, (2) port its test file first and make it pass unchanged where semantics are kept, (3) adapt types to `packages/domain`, (4) record any intentional semantic change in the PR description and in `docs/decisions/` as a dated note. Never port a module without its test if one exists.
