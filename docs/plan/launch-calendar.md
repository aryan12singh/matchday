# Launch calendar — re-baselined 25 Jul 2026

**Supersedes the dates in `docs/discovery/15-owner-decisions-addendum.md` §G.** Task numbers,
dependency order and acceptance criteria in `14-implementation-phases-tasks.md` are unchanged.

**Hard deadline: live before Premier League MW1 kickoff, Friday 21 August 2026.**

## Why this exists

Addendum §G planned five weeks from Mon 20 Jul. At re-baseline on Sat 25 Jul the repo held
one commit (README only) — none of T1–T6 existed, so the whole of §G Week 1 was still ahead
with one day of it left. That is **~5 days lost against a 5-week plan**, absorbed by:

- shortening the final build week to four days,
- cutting buffer from 5 days to 3,
- moving four items to post-launch (below).

Deliberately *not* compressed: T2 (schema), T12 (lock enforcement tests), T14 (settlement).
Those carry the CLAUDE.md invariants, and a defect there is unrecoverable once real
predictions are locked against real money.

## Weeks

| Week | Dates | Tasks | Exit condition |
|---|---|---|---|
| **1R** | Sat 25 Jul – Fri 31 Jul | T1 scaffold + CI + design system, T2 baseline schema incl. addendum §D delta, T4 domain, T3 auth/profiles, T5 scoring port · T6 provider spike runs in parallel from day 1 | Preview deploys; migrations apply clean; lock + immutability triggers raise in psql; scoring golden vectors green |
| **2R** | Sat 1 Aug – Fri 7 Aug | T7 adapter + normalizers, T8 jobs core, T9 season bootstrap (real PL 26/27), T12 prediction API + lock/RLS integration tests | Local DB shows 380 fixtures, 20 teams, MW rounds, markets with correct `locks_at`; security tests green in CI |
| **3R** | Sat 8 Aug – Fri 14 Aug | T10 tick scheduler + live/final jobs, T13 MW predict screen, T14 settlement + score runs, T21 selection & voting | Simulated matchweek end to end: predict → lock → result → components → diff rows on correction |
| **4R** | Sat 15 Aug – Tue 18 Aug | T15 leagues/membership, T16-lite (bind `rule_sets` v1, no weight-editor UI), T17 leaderboards + Table race tab, T22 season table predictor + Golden Boot entry | All six §G non-negotiables present and exercised by two real accounts |
| **Freeze** | Wed 19 Aug – Fri 21 Aug | No new features. Seed real league(s), preseason drill against a live fixture on the provider, security checklist §10.4 items 1–4 and 6, Supabase Free→Pro, API-Football Free→Pro | Live before Friday's kickoff |

## Moved to post-launch

None of these appear in the addendum §G non-negotiable list.

1. **T16 weight-editor UI** — bind `rule_sets` v1 at seed instead. `rule_set_versions` +
   `effective_from_round` still ship in T2, so mid-season revaluation stays possible via SQL
   and invariant 4 is intact. (~1.5 days)
2. **T11 `/ops` UI** — replaced by read-only sync/quota SQL views plus Sentry alerts (~2h of
   work, not a task). (~1 day)
3. **T18 season-market settlement automation** — the table settles in May 2027 and a manual
   trigger is already the stated AC. Only the *lock* is launch-critical, and it ships with T22.
4. **League Home clubhouse depth** (rivalry module, trophy cabinet, records, banter feed) —
   T15 ships a minimal league home; the clubhouse screen is Phase 3.

Already post-launch by owner instruction and §G: Live Match screen, Recap, T19 live centre,
T20 notifications + PWA.

## Non-negotiable for 21 Aug (unchanged from §G)

Auth + leagues · MW predictions with hard per-fixture kickoff locks · selection/voting ·
table predictor + Golden Boot entry (hard lock at the season's first kickoff, no grace
window) · settlement · MW + overall + Table race boards.

## Cut order if slipping

recap/feed → H2H → live-centre polish → push notifications (email reminders ship first).

## Owner actions on the critical path

| When | Action | Why |
|---|---|---|
| **Immediately** | API-Football key (free 100/day tier is enough) | T6 blocks T7, which blocks all of Week 2R. The only external dependency on the critical path. |
| By ~19 Aug | Supabase Free → Pro ($25/mo) | Daily backups. A money ledger and locked season predictions with no backup is the one risk not worth launching with. |
| By ~19 Aug | API-Football Free → Pro ($19/mo) | 7,500 req/day for live matchday polling. |
| Before launch | Vercel project linked to the repo | Preview deploys per PR; T1 AC. |
