# 15. Owner Decisions Addendum — 18 Jul 2026

**This file SUPERSEDES conflicting content in files 03–14.** It records product-owner decisions taken after the pack was written, specs two new MVP features, and replaces the launch plan with a hard-deadline version. Claude Code: read this file immediately after `00-START-HERE.md`.

Hard fact anchoring everything: **PL 2026/27 MW1 starts Friday 21 August 2026** (fixtures released 19 June 2026; season runs to 30 May 2027, 33 weekend + 5 midweek rounds). Launch must be live before the first kickoff. ~5 weeks from today.

---

## A. Resolved decisions (owner-confirmed)

| Ref | Decision |
|---|---|
| D14 | **Launch before MW1 (21 Aug 2026).** Phase-A cut in §G. |
| Scoring v1 | **Port the WC 7-category engine unchanged** as `rule_sets` v1. Weights/categories adjustable later via `rule_set_versions` — no redesign now. |
| D6 | **Per-fixture kickoff deadlines** (WC parity). No per-round deadline. |
| D5 | **Global predictions** per fixture/market. Leagues differentiate via *fixture selection* (§B), not per-league predictions. |
| Multi-league | **Real requirement season one** — some leagues won't bet. Prize scheme is therefore *optional per league_season* (null = points-only league; hide all money UI). |
| Prizes | **Weekly + overall zero-sum format retained.** Amounts configurable per league (owner may adjust); `prize_schemes` design in §6 stands, now with editable amount tables and nullable binding. |
| D15 | Name stays **MatchDay**. |
| Funding/team | Owner (Aryan) pays infra. Aryan = primary dev, second dev = assistant. Plan assumes solo-driver + Claude Code velocity. |
| ASSUME-1/2 | Confirmed implicitly: fresh start, no WC data migration; small private cohort. |
| D2/D3 etc. | Hosting/provider finalized in §F. |

## B. NEW FEATURE — League fixture selection (admin pick + voting)

Not every fixture counts in every league. Per `league_season`:

- `selection_mode`: `'all'` (default) | `'admin_pick'` | `'vote'`; `fixtures_per_round` int **nullable, no default** — admin may optionally set a target count per round, otherwise the selection is whatever gets finalized.
- **admin_pick:** league admin selects the round's fixtures any time before finalization.
- **vote (advisory):** every member may vote for any fixtures they want counted (toggle per fixture, no cap). Live tallies visible to the league; individual voters not shown. **Votes are advisory — the admin holds final power:** admin reviews tallies and finalizes the actual selection (any number of fixtures, may deviate from the vote).
- **Windows:** voting/selection opens when the round's fixtures are confirmed (≥7 days before the round's first kickoff). Admin gets finalize reminders at T-48h and T-24h. **If still unfinalized 24h before the round's first kickoff → automatic fallback: all fixtures count** (members are notified). Admin may still adjust selections up until the first *selected* kickoff.
- **Fallback guarantee:** a round can never be empty.
- **Scoring impact:** predictions stay global; league aggregation counts only markets on that league's selected fixtures for the round. The predict screen shows the full matchweek with per-league "counts in <league>" badges; predicting non-selected fixtures is allowed (scores in any league that did select them, else just for fun).
- Notifications: `voting_open`, `selection_finalized` events (post-launch wave OK).

## C. NEW FEATURE — Season table predictor (+ Golden Boot)

The season-long game, entered once, locked at the season's first kickoff:

- **Market type `season_table`** (scope=season, one per user globally): answer = ordered list of **all 20 team ids**, `value = { "order": [team_uuid × 20] }`.
- **UI (new screen 22):** full-page reorderable list — drag handles + up/down buttons on mobile, drag-and-drop on desktop; seeded with a sensible default order; draft saves anytime; hard lock at first kickoff with countdown; post-lock becomes a live tracking view.
- **Scoring (separate competition, not merged into weekly points):** per team `diff = |predicted_pos − actual_pos|`; **score = Σ diff; lowest wins**. Own leaderboard tab ("Table race") and optional own prize line.
- **Stats computed alongside:** Σ diff² (punishes big misses), exact-position hits, champion correct, top-4 hits, relegation-zone hits, biggest miss (team + magnitude), per-team diff heat strip. All displayed on the tracking view and leaderboard expand.
- **Live tracking:** after each MW, evaluate everyone against the *current* table ("if the season ended today") with movement indicators; final settlement after MW38 confirms.
- **Golden Boot:** separate season market (player pick, squad-search UI), locks at first kickoff, settled at season end from provider top-scorers; league-configurable points/prize.
- **Dropped (owner-confirmed):** standalone champion / top-4 / relegation picks — redundant, since they're derived stats of the table prediction. Season markets = **full 20-position table + Golden Boot** only.

## D. Schema delta (apply on top of `09-database-schema.md`)

```sql
-- League fixture selection
alter table league_seasons
  add column selection_mode text not null default 'all'
    check (selection_mode in ('all','admin_pick','vote')),
  add column fixtures_per_round int,          -- null = all fixtures
  add column prize_scheme_id uuid null;       -- ensure nullable: null = points-only league

create table league_round_selections (
  id uuid primary key default gen_random_uuid(),
  league_season_id uuid not null references league_seasons(id),
  round_id uuid not null references rounds(id),
  fixture_id uuid not null references fixtures(id),
  source text not null check (source in ('admin','vote','fallback')),
  finalized_at timestamptz,
  unique (league_season_id, round_id, fixture_id)
);

create table league_fixture_votes (
  league_season_id uuid not null references league_seasons(id),
  round_id uuid not null references rounds(id),
  fixture_id uuid not null references fixtures(id),
  user_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  primary key (league_season_id, round_id, fixture_id, user_id)
);
-- RLS: members of the league may insert/delete OWN votes while round unfinalized;
-- tallies readable by members via a view that never exposes user_id (proposed default).
-- Finalization: job or admin action writes league_round_selections + stamps finalized_at;
-- BEFORE trigger rejects vote writes once finalized.

-- Season table predictor: NO new tables — reuse markets/predictions.
-- market_types row: code='season_table', scope='season',
--   answer_schema = {"type":"team_ranking","team_count":20}
-- predictions.value = {"order":[...20 team uuids...]}; lock via markets.locks_at
--   = season first kickoff (existing lock trigger covers it).
-- Settlement: one score_components row per (market,user) with payload
--   {"total_abs":n,"total_sq":n,"exact_hits":n,"champion_hit":b,"top4_hits":n,
--    "releg_hits":n,"biggest_miss":{"team":uuid,"diff":n},"per_team":[...]}
--   League "Table race" board reads/aggregates payloads; lowest total_abs wins;
--   tiebreak: total_sq asc, then exact_hits desc, then joined_at asc.
```

League weekly/overall aggregation change: join through `league_round_selections` when `selection_mode <> 'all'` (else all fixtures in round). Golden Boot uses the existing season-market pattern from files 05/09 unchanged.

## E. Screens delta (apply on top of `04-screens-and-ia.md`)

- **Screen 4 (MW predict):** add league-selection badges + optional "selected only" filter when any of the user's leagues uses selection.
- **NEW Screen 21 — Round selection & voting:** member view (vote toggles with live tally bars, cap indicator, finalization countdown); admin view (pick list, override, finalize-now). Entry point from league home + MW predict banner.
- **NEW Screen 22 — Season table predictor:** as §C. Pre-lock: reorder + save-draft. Post-lock: live diff view (predicted vs current position per team, colored deltas) + stats panel.
- **Screen 14 (season markets):** reduces to Golden Boot entry + card linking to screen 22.
- **Screens 9/10 (leaderboards):** add **"Table race"** tab; leagues with null prize scheme hide all money columns/rows app-wide.

## F. Hosting & plans — final evaluation (owner pays; verified 18 Jul 2026)

| Layer | Choice | Cost | Why / alternatives rejected |
|---|---|---|---|
| Frontend + API routes | **Vercel Hobby** | $0 | Best Next.js DX, previews, CI. Private non-revenue friends app fits non-commercial terms. Hobby cron's once-daily cadence limit is irrelevant — our scheduler is pg_cron→pg_net hitting `/api/jobs/tick` externally. Watch the ~4h active-CPU/month cap: make pg_cron run the "anything due?" check **in SQL** and only call the endpoint when work exists. Fallbacks: Vercel Pro $20 (limits/commercial doubt), Railway ~$5–10 always-on container (first escape hatch; no serverless limits), Render Starter $7 (free tier sleeps — useless for our wake pattern), Fly ~$5 (more config), Cloudflare $0 (OpenNext friction — rejected for a 5-week timeline). |
| DB + Auth + Realtime + cron | **Supabase Free → Pro at launch** | $0 now → **$25/mo** from ~mid-Aug | Free tier (500MB DB, 200 realtime conns, 2M msgs/mo, unlimited API reqs) comfortably covers build + ≤50 users. Upgrade driver is **daily backups** — a money ledger and locked season predictions must be recoverable; Free has none. Pro also removes pause risk and lifts egress 5→250GB. Alternatives rejected: Neon+Clerk (~$19+) loses RLS-integrated auth, realtime, and pg_cron colocation that the whole design leans on. |
| Football data | **API-Football Pro** | **$19/mo** | 7,500 req/day, 300 req/min — ample for one league's matchdays with per-minute live polling. Plans are prepaid, no overage: requests hard-stop at the cap, so the quota ledger + circuit breaker in §8 are load-bearing. Ultra ($29, 75k/day) is a one-click upgrade if ever squeezed. Dev on the free 100/day tier + cassettes. Sportmonks Starter €29 (5 leagues) kept as quality fallback; football-data.org rejected (no first-goalscorer detail). |
| Email | Resend free tier | $0 | 3k emails/mo ≫ needs. |
| Errors | Sentry free tier | $0 | |
| **Totals** | | **build: $0–19 · live: ≈ $44/mo · ceiling: ≈ $74/mo** (Vercel Pro + API Ultra) | |

## G. Revised launch plan — hard deadline Fri 21 Aug (supersedes §14.1 calendar; task numbers from §14.2 kept, two tasks added)

- **Wk 1 (Jul 20–26):** T1–T5 (scaffold, schema incl. §D delta, auth, domain, scoring port) + T6 provider spike.
- **Wk 2 (Jul 27–Aug 2):** T7 adapter/normalizers, T8 jobs core, T9 season bootstrap (real PL 26/27 data), T12 prediction API + lock tests.
- **Wk 3 (Aug 3–9):** T10 tick/scheduler + live/final jobs, T13 MW predict screen, T14 settlement engine, **T21 (new): selection & voting** (schema, finalization job, screen 21).
- **Wk 4 (Aug 10–16):** T15 leagues/membership, T16 rule bindings + league admin (incl. selection settings + optional prize scheme), T17 leaderboards (+ Table race tab), **T22 (new): season table predictor + Golden Boot entry** (screen 22, lock wiring), T11-minimal `/ops` (quota + sync visibility only).
- **Wk 5 (Aug 17–21):** buffer; seed the real league(s); preseason drill against a live fixture from any in-progress competition on the provider; security checklist subset (§10.4 items 1–4, 6); launch.
- **Post-launch MW2–5:** T19 live centre + provisional points, T20 notifications + PWA, prize ledger UI + settlement history, H2H/recap/activity feed, full `/ops`.

**Cut order if slipping** (solo primary dev): recap/feed → H2H → live-centre polish → push notifications (email reminders ship first). **Non-negotiable for Aug 21:** auth+leagues, MW predictions with locks, selection/voting, table predictor + Golden Boot entry (**hard lock at the season's first kickoff — no late entries, no grace window**; fixture markets hard-lock at each fixture's own kickoff time), settlement, MW + overall + Table race boards.

## H. Final confirms — RESOLVED by owner (18 Jul 2026)

1. **No fixed fixtures-per-round default.** Members vote freely on which matches count; count per round is flexible.
2. **Vote tallies visible** to the league (voter identities not shown). Votes are **advisory**: admin reviews and finalizes, and may override at any point before the first selected kickoff.
3. **Confirmed:** standalone champion/top-4/relegation picks dropped. Season markets = full 20-position table predictor + Golden Boot.
4. **Confirmed:** table predictor is a separate lowest-wins side competition — never merged into weekly/overall points.
5. **Hard locks everywhere, keyed to kickoff time:** each fixture's markets lock at that fixture's kickoff; season markets (table + Golden Boot) lock at the season's first kickoff. No grace windows, no late entries.

No open product questions remain. Remaining unknowns are the technical spike items in `13-decisions-and-open-questions.md` §13.4 (resolved during Task 6).
