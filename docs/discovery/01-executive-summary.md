# 1. Executive Summary & Product Direction

## 1.1 Executive recommendation

**Build MatchDay v2 in a clean new repository, porting proven logic modules from `wc26-predictor` rather than refactoring it in place.** Keep the existing stack (Next.js + TypeScript + Supabase + Vercel + PWA) — it is proven in production by the current app and fits a two-developer team. Replace the two weakest parts of the old system:

1. **The data model.** The old schema stores team names as raw text on `matches` (`home_team text`, see `supabase/migrations/20260609000000_initial_schema.sql`) and hardcodes World Cup structure (fixed `rounds`, `gw_number` 1–8, bracket tables). v2 uses the generic hierarchy **Competition → Season → Stage → Round → Fixture** with canonical `teams`/`players` entities and a provider ID mapping table.
2. **The data pipeline.** The old app syncs from an unofficial FIFA GameDay endpoint via manually-run CLI scripts from a trusted laptop ([FACT] `scripts/sync-fifa-matches.ts`, `.github/workflows/live-data.yml` is manual-dispatch only). v2 uses **API-Football (Pro plan, US$19/mo)** behind an adapter layer, driven by an automated scheduler (**Supabase `pg_cron` → authenticated Next.js job routes**), with raw payload archiving, quota tracking, locks and structured sync runs.

The scoring philosophy of the old app — **score category hits once, re-weight per league at read time** — is its best architectural idea ([FACT] `lib/scoring.ts` lines 54–60) and is carried forward, but formalized into versioned rule sets, score runs and audited score components so results are deterministic, re-runnable and never silently changed mid-season.

**MVP:** Premier League 2026/27, private leagues, the current seven fixture markets + season markets (champion, top 4, relegation, Golden Boot), matchweek + season leaderboards, live match centre with provisional points, PWA + push reminders. Target: ready before the 2026/27 PL season starts (mid-August 2026 — tight; see phases doc for a de-scoped fallback).

**Estimated infra cost at private-beta scale: ≈ US$44–50/month** (Supabase Pro $25 + API-Football Pro $19 + Vercel Hobby $0 + Resend/email free tier). Breakdown and upgrade triggers in `12-testing-ops-costs.md`.

## 1.2 Three possible product directions

### Direction A — "Season upgrade" (minimal generalization)
Fork the WC app, swap FIFA sync for a Premier League feed, rename gameweeks to matchweeks, keep the existing schema shape with text team names and per-prediction `pts_*` columns.

- Development effort: **Low** (4–6 weeks). Monthly cost: lowest.
- Reliability: inherits manual-sync fragility. Scalability: **poor** — every new competition is another fork-level change; season markets, cups and multi-competition leagues don't fit the schema.
- Verdict: fastest to a PL beta, but re-pays the whole redesign cost the moment La Liga or the Champions League is added. **Rejected.**

### Direction B — "Platform" (recommended)
Clean repo; competition-agnostic domain model; generic prediction-market system; provider adapter; automated ingestion; versioned scoring. Premier League is simply the first configured competition. Private leagues remain the social unit; the schema leaves room for a public tier (league visibility flag, organizer role, per-league rule bindings).

- Development effort: **Medium-High** (10–14 weeks to MVP for two developers, of which weeks 1–3 are domain + ingestion foundations that Direction A skips).
- Reliability/data quality: **high** — automated sync, raw archive, re-runnable scoring.
- Scalability: adding La Liga later is *configuration + provider league ID*, not code. Cups and UCL league-phase fit the Stage model.
- Vendor lock-in: adapter isolates the football provider; Supabase lock-in accepted consciously (see §1.4).
- Verdict: **Chosen.** It is the only direction that satisfies the stated requirement that architecture must later support 8+ competition types without preventing a public product.

### Direction C — "Public fantasy-adjacent product first"
Build for public leagues, open signup, paid organizer tier and many game modes (survivor, pick-six, confidence pools) from day one.

- Development effort: **Very high**; adds moderation, abuse handling, billing, legal review (paid prediction games brush against gambling regulation in several jurisdictions — a real risk given prize pools).
- Verdict: premature. The current user base is one group of seven friends. **Rejected for now**, but Direction B's domain model (generic markets, rule-set versioning, league roles) is explicitly designed so C remains reachable without a rewrite.

## 1.3 Why Direction B and not a middle path

The single most expensive thing to change later is the prediction/scoring data model, because historical predictions and settled prizes depend on it. Direction A locks in a fixture-market-only, text-team, single-tournament model. Direction B's extra 3–4 weeks buy: (a) generic `market_types` + JSONB prediction values (new markets become rows, not migrations), (b) canonical team/player entities with provider mapping (provider swap possible), (c) versioned rule sets (the brief's "rules must not silently change mid-season" requirement is structurally enforced, not a convention). All three are one-way doors if skipped.

## 1.4 Stack evaluation (brief: "evaluate rather than accept blindly")

| Choice | Verdict | Reasoning |
|---|---|---|
| Next.js (App Router) | **Keep** | Team knows it; SSR + API routes + Vercel integration; the old app's 40+ routes port conceptually. Considered Remix/SvelteKit: no capability gain worth retraining. |
| TypeScript | **Keep** | Non-negotiable for a shared scoring engine used by UI, jobs and tests. |
| Supabase Postgres | **Keep** | RLS is load-bearing in the old app's security model (kickoff-lock triggers, membership scoping) and ports directly. Postgres JSONB fits raw payload archive + market values. Considered Neon + custom auth: loses RLS-integrated auth, Realtime and Storage for zero benefit at this scale. |
| Supabase Auth | **Keep** | Working email/password + OAuth callback exists (`app/auth/callback/route.ts`). Add magic-link for friend onboarding. |
| Supabase Realtime | **Keep, narrow use** | Only for live match centre + live leaderboard deltas. Everything else is request/response. The old app already caches live data in a `live_cache` table [FACT: migration `20260620000003_live_cache.sql`] — keep that pattern (Realtime broadcasts on table change, clients read cache). |
| Supabase Storage | **Keep** | Avatars + share cards already work this way [FACT: migration `20260610000001_avatar_storage.sql`, `components/RecapShareActions.tsx`]. |
| Vercel | **Keep (Hobby initially)** | Zero-ops deploys. Cron limitation on Hobby is bypassed by scheduling from `pg_cron` (see `08-data-ingestion-and-jobs.md`). Upgrade trigger to Pro ($20/mo): function timeout >60s needs, team seats, or >100GB bandwidth. |
| PWA (`@ducanh2912/next-pwa`) | **Keep** | Working offline shell + push in production today (`worker/index.ts`). Native mobile explicitly out of scope per constraints. |
| Tailwind | **Keep** | Old app uses Tailwind 3; start v2 on Tailwind 4 (CSS-first config) since it's a new repo. |
| Vitest | **Keep** | 13 existing test files port as reference vectors for the scoring engine. |
| **New:** provider = API-Football | **Add** | Full comparison in `07-provider-comparison.md`. |
| **New:** scheduling = pg_cron → job routes | **Add** | Comparison of Vercel Cron / Supabase / QStash / worker in `08-data-ingestion-and-jobs.md`. |
| **New:** email = Resend | **Add** | Deadline reminder emails for users without push. Free tier: 3k emails/mo (verify current limits). |

## 1.5 What success looks like

- The seven-player group runs a full PL 2026/27 season league with **zero manual data operations in a normal week** (the old app requires daily `npm run data:fifa:daily` from a laptop — [FACT] `package.json` scripts + README "Data operations" section).
- A second competition (recommend: Champions League 2026/27, because it exercises the league-phase→knockout hybrid format) can be enabled by inserting competition/season config rows and provider league IDs — no schema migration.
- Every point on every leaderboard can be traced: prediction → settlement → score components → rule-set version → score run.
