# 13. Risks, Open Questions & Decisions Required Before Coding

> **STATUS UPDATE (18 Jul 2026):** Owner has resolved the blocking set — see `15-owner-decisions-addendum.md` (which supersedes this file where they conflict). In short: D1 ✅ clean repo, D2 ✅ API-Football Pro, D3 ✅ pg_cron→job routes, D4 ✅ pnpm, D5 ✅ global predictions (+ league fixture selection, addendum §B), D6 ✅ per-fixture deadlines, D14 ✅ **launch before MW1, 21 Aug 2026**, D15 ✅ MatchDay, D17 ✅ Resend, D18 ✅ Sentry. New scope added: fixture selection/voting + season table predictor + Golden Boot; standalone champion/top4/relegation markets dropped. Remaining small confirms: addendum §H.

## 13.1 Risks (ranked)

1. **Timeline vs PL season start (mid-Aug 2026).** ~10–14 weeks of work vs ~4 weeks of calendar. **Mitigation:** launch mid-season is acceptable for a friends beta (join from MW n; leaderboards simply start then), OR run a de-scoped "Phase A" launch (fixture markets + one league config + manual-ish ops) and finish season markets/prizes by MW4–5. Decide (D14).
2. **Prize pools ≈ gambling-adjacent.** Fine as a private ledger among friends; a *public/paid* product with cash prizes triggers real regulatory questions (jurisdiction-dependent — e.g. Singapore's remote gambling rules are strict). **Mitigation:** app never holds/moves money (ledger only); revisit with counsel before any public tier. 
3. **Provider correction churn** (late scorer changes, own-goal reattributions) breaking trust in settled points. **Mitigation:** delayed re-checks + diff-logged reruns + visible revision notices (designed in).
4. **Daily-quota exhaustion mid-matchday** (bug/loop). Mitigation: circuit breaker + admin alert + live-poll-only reserve.
5. **Single-maintainer ops bus factor.** Mitigation: `/ops` dashboard replaces laptop rituals; runbooks; second dev has prod access from day one.
6. **pg_cron→pg_net delivery flakiness.** Mitigation: tick heartbeat monitor on `/ops` (alert if no tick in 5 min); QStash swap documented (§8.4).
7. **Scope creep** (game modes are seductive). Mitigation: MVP non-goals list (§3.3) is contractual; parking lot exists.

## 13.2 Assumptions made in this pack (confirm or correct)

- [ASSUME-1] WC26 data stays in the old app; no migration into v2.
- [ASSUME-2] Beta cohort is the existing 7-person group (+ maybe a second league), ≤50 users season one.
- [ASSUME-3] English-only UI; timezone-aware display (SGT-heavy user base) via profile TZ.
- [ASSUME-4] Own goals do not count for `first_goalscorer` (industry convention); first *team* to score still credits the team scored *for*.
- [ASSUME-5] Two developers, part-time availability (student schedule) — phases sized accordingly.
- [ASSUME-6] Old repo's README claims (screenshots, features) match deployed behaviour; audit relied on source over README where they could differ.

## 13.3 Decisions required BEFORE coding (⛔ = blocking Task 1–5)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 ⛔ | Repo strategy | refactor / fork / clean | **Clean repo `matchday`** (§11.1) |
| D2 ⛔ | Provider | API-Football / Sportmonks / football-data.org | **API-Football Pro** (§7.4) |
| D3 ⛔ | Scheduling | Vercel Cron / pg_cron / QStash / worker | **pg_cron → job routes** (§8.4) |
| D4 ⛔ | Package manager / workspace layout | npm / pnpm workspaces | **pnpm workspaces** per §11.3 |
| D5 ⛔ | Global vs league-scoped predictions (MVP) | global / per-league | **Global** (§5.2), schema leaves door open |
| D6 ⛔ | Deadline model | per-fixture kickoff / per-round | **Per-fixture** (parity with old app) |
| D7 | Abandoned/awarded fixture policy | void (0 pts) / score-as-at-abandonment / follow-award | **Void fixture markets**, standings follow provider |
| D8 | Two-legged/ET scoring policy (needed only for UCL phase 2) | 90-min result only / incl. ET | **90-min result only** (matches old app's regulation focus — [FACT] `regulationTimeGoals` in `lib/fifa-client.ts`) |
| D9 | Season-market reveal | always after lock / league policy | **Always after lock** |
| D10 | Prize tie handling | split evenly / tiebreak-through | **Tiebreak chain first; true ties split** (§6.5) |
| D11 | Mid-season season-market re-pick windows | none in MVP / January window | **None in MVP** |
| D12 | Account deletion semantics | hard delete / anonymize keep scores | **Anonymize** (league integrity) |
| D13 | Raw payload retention | 14d live / season daily (proposed) | Accept proposal |
| D14 ⛔ | Launch target | full MVP mid-season / Phase-A by MW1 | Owner call — see risk 1 |
| D15 | Name/branding | keep "MatchDay" (package.json already says it) / new | Keep MatchDay |
| D16 | Second competition next | UCL / La Liga | **UCL** (exercises hybrid format) |
| D17 | Email provider | Resend / Postmark / none-MVP | **Resend** |
| D18 | Error tracking at beta | Sentry / logs only | Sentry free |

## 13.4 Open questions (non-blocking, resolve during build)

- Does API-Football's PL feed reliably include xG in `fixtures/statistics`? (Verify in Task 6 spike; UI treats xG as optional.)
- Lineup availability lag on PL matchdays (target: within 5 min of official ~60–75 min pre-KO posts) — measure during preseason drill.
- Exact Vercel Hobby cron/function limits at build time (they change) — affects only whether a 60s job ceiling needs chunking tweaks.
- Supabase Realtime message quotas on Pro vs our live-window fanout — measure; fallback is 30s polling of `live_cache`-style reads.
- Whether the group wants a per-round single deadline option (D6 alternative) as a league setting in season one.
