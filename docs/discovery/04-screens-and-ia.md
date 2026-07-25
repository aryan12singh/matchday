# 4. Information Architecture & Screen Specifications

## 4.1 Information architecture

**Navigation model:** mobile = bottom tab bar (5 tabs) + sheet menus; desktop = left sidebar (port of the old `components/AppShell.tsx` shell concept) + command palette (port `CommandPalette.tsx`).

Primary tabs: **Home** · **Predict** · **Live** · **League** · **More**.

```
/                       Landing (public)
/login /join /install   Onboarding (public)
/home                   Dashboard
/predict                Predictions by matchweek  → /predict/mw/[n]
/match/[id]             Match page (pre/live/post)
/live                   Live & results centre
/table                  Competition table          → /table/[competitionSeason]
/teams /teams/[id]      Teams & squads; /players/[id]
/league                 Active league overview
/league/leaderboard     Overall     /league/mw/[n]  Matchweek board
/league/members         Members & rivals   /league/h2h/[userId]
/league/recap/[n]       Matchweek recap
/league/season-picks    Season predictions (mine + revealed others)
/league/admin           League administration (organizer role)
/profile                Profile & settings  /settings/notifications
/rules                  Scoring rules (rendered from active rule-set version)
/ops                    Platform admin: data & sync operations (platform_admin role)
```

URL state conventions: active league in a cookie/profile (old app pattern via `profiles.active_league_id`); matchweek and filters in the URL (port `lib/url-state.ts` idea) so links shared in group chats deep-link correctly.

**Global states convention (applies to every screen):** every data region defines skeleton (loading), empty (with a next-step CTA), and failure (inline retry, never a blank page; degraded data shows a "last updated X min ago" stamp fed by sync-run metadata). PWA offline: cached shell + last-fetched data where available + explicit offline banner.

## 4.2 Screen specs

Template per screen — **Goal** / **Key info** (priority order) / **Actions** / **Mobile** / **Desktop** / **Phase behaviour** (pre-kickoff → live → full-time) where relevant. States are covered by the global convention; only screen-specific states are called out.

### 1. Public landing `/`
- **Goal:** convince an invited friend to sign up; explain the game in one scroll.
- **Key info:** value prop ("Predict every match. Beat your friends."), 3 feature shots (predict flow, live points, leaderboard), how scoring works teaser, sign-in CTA.
- **Actions:** Sign up / Log in / "Have an invite code?" → `/join`.
- **Mobile:** single column, hero + carousel. **Desktop:** hero split with product screenshot.
- No auth-gated data; static, fast, indexable later. If a `?code=` param is present, carry it through signup into auto-join.

### 2. Login & onboarding `/login`, `/join`, first-run
- **Goal:** account in <60s; land the user inside a league.
- **Key info:** email+password and magic-link; after auth, forced-choice: join with code / create league / browse solo.
- **Actions:** auth; username + avatar (deferrable); paste code → league preview card (name, member count, competition) → confirm join.
- **Failure states:** invalid/expired code (specific message), already-member (redirect to league).
- After first join: 3-step tour → prompt to submit current matchweek → prompt notifications opt-in (defer PWA install prompt to `/install`, not here).

### 3. Home dashboard `/home`
- **Goal:** answer "what needs my attention right now?"
- **Key info (priority):** 1) next deadline card (countdown + how many fixtures unpredicted) 2) live-now strip (if matches in play: score + my provisional pts) 3) my rank card per league (rank, movement arrow, pts behind leader) 4) recent results with my points earned 5) league activity feed.
- **Actions:** "Complete matchweek →", tap live strip → `/live`, league switcher.
- **Mobile:** stacked cards in the priority order. **Desktop:** 2-col — left: deadline+predict summary+results; right: rank cards+activity.
- **Phase:** pre-deadline the deadline card dominates; during matches the live strip pins to top; after a matchweek completes it swaps to "Recap ready" card.

### 4. Predictions by matchweek `/predict/mw/[n]`
- **Goal:** submit/edit a full matchweek fast (P1: <3 min; P4: score-only path).
- **Key info:** matchweek selector; per fixture: teams+crests, kickoff (user TZ), my current prediction summary chips, lock state; submission progress ("7/10 predicted").
- **Actions:** inline score steppers per fixture; expand row → advanced markets (GD/TG/BTTS hedges, first team, first scorer with searchable squad picker — port `PlayerCardPicker.tsx`); per-fixture autosave with saved-tick; "copy scoreline defaults" quick-fill 🔜.
- **Mobile:** vertical fixture cards; advanced markets in bottom sheet (port `PredictionModal.tsx` interaction, decomposed). **Desktop:** table-like rows with inline expansion; keyboard nav.
- **Phase:** pre-kickoff editable; at kickoff row flips to locked (padlock + my picks now visible to league per reveal rules); live/FT rows show provisional/final points chip and link to match page.
- **Failure:** save conflict at lock boundary → explicit "locked at kickoff, not saved" toast (DB trigger is source of truth).

### 5. Individual match page `/match/[id]`
- **Goal:** everything about one fixture + how my prediction is doing.
- **Key info pre-kickoff:** kickoff, venue, form, table positions, my prediction (editable), lineups when announced (~60–75 min before KO) with alert "lineups are in — check your first scorer".
- **Live:** score + minute, events timeline (goals/cards/subs), my provisional points breakdown per category, league mini-board for this match (who picked what — reveal-gated), stats (possession/shots/xG).
- **Full-time:** final result, confirmed points breakdown, "points settled in run #… at …" transparency line, formation pitch with ratings-free lineups (port `FormationPitch.tsx`).
- **Actions:** edit prediction (pre-KO), add to calendar (port `AddMatchToCalendar.tsx`), share.
- **Mobile:** sticky scoreboard header, tabbed sections (Overview/Lineups/Stats/League). **Desktop:** scoreboard header, 2-col: timeline+stats left, my points + league picks right.

### 6. Live & results centre `/live`
- **Goal:** matchday cockpit across all fixtures.
- **Key info:** in-play matches (score, minute, my provisional pts delta), today's finished + upcoming, live matchweek mini-leaderboard (provisional).
- **Actions:** tap → match page; pull-to-refresh (also Realtime-pushed).
- **Mobile:** list ordered live→upcoming→finished. **Desktop:** grid of live cards + side panel provisional board.
- **Empty (no matches today):** next matchday preview + deadline countdown. This screen is the primary Realtime consumer.

### 7. Competition table `/table`
- **Goal:** current PL standings; later, per-enrolled-competition tabs.
- **Key info:** standard table (P W D L GD Pts, form, movement), zone colouring (UCL/UEL/relegation), stage selector for future league-phase competitions.
- **Actions:** tap team → team page; toggle home/away splits 🔜.
- **Mobile:** condensed columns, horizontal scroll for detail. **Desktop:** full table + mini "my season picks vs reality" panel (e.g. my relegation picks highlighted).

### 8. Private league overview `/league`
- **Goal:** the league's front door — identity + season story.
- **Key info:** league name/label, competition + season, top-3 podium, my rank, prize pot status (if enabled), latest recap teaser, activity feed, pending members' submission status for current matchweek ("2 of 7 haven't predicted").
- **Actions:** open leaderboard, nudge non-submitters (organizer; sends push/email), invite (share code — organizer only, per old hidden-code policy), league switcher.
- **Mobile:** stacked. **Desktop:** 2-col with feed right.

### 9. Overall leaderboard `/league/leaderboard`
- **Goal:** season standings with full transparency.
- **Key info:** rank, member, points, movement vs last matchweek, per-category breakdown (expandable row: outcome/exact/GD/TG/BTTS/first-team/first-scorer/season-market columns), accuracy %, prize position (if scheme active).
- **Actions:** expand rows; tap member → H2H; sort by category; jump to matchweek boards.
- **Mobile:** rank+name+pts+movement; expansion sheet for breakdown. **Desktop:** full breakdown table (this is the Strategist's screen).
- **Tiebreak indicator:** tied points show the deciding tiebreak on hover/expand (chain ported from `lib/leaderboard.ts`).

### 10. Matchweek leaderboard `/league/mw/[n]`
- Same skeleton as #9 scoped to one matchweek + that week's prize line. **Phase:** shows "provisional — matches in play" banner until all fixtures scored; flips to settled with score-run stamp.

### 11. Members & rivals `/league/members`
- **Goal:** who's in the league; pick rivals.
- **Key info:** member list (avatar, joined, rank, form sparkline), my designated rivals (pin up to N for dashboard deltas).
- **Actions:** pin rival, open H2H, organizer: remove member / transfer organizer.

### 12. Head-to-head `/league/h2h/[userId]`
- **Goal:** settle arguments.
- **Key info:** season series (me vs them per matchweek, W-L-T), cumulative points-race chart (port `components/charts.tsx`), category strengths radar/table, biggest single-match swings, current gap.
- **Mobile:** chart + stat cards stacked. **Desktop:** chart left, categories right.

### 13. Matchweek recap `/league/recap/[n]`
- **Goal:** shareable weekly story (retention driver in the old app).
- **Key info:** MW winner, biggest climber/faller, best pick (highest-value correct), worst miss, consensus vs contrarian outcomes, updated prize ledger.
- **Actions:** share card image (port `RecapShareActions.tsx` + Storage), navigate prev/next.
- **Generated** after the matchweek's score run settles; "not ready yet" state links to live board.

### 14. Season predictions `/league/season-picks`
- **Goal:** submit/view long-horizon picks.
- **Key info:** my picks (champion, top 4, relegation, Golden Boot) with current-reality delta ("Your champion pick is 2nd, 3 pts off"); revealed members' picks grid after lock.
- **Actions:** edit before season lock; view others post-lock (always revealed once locked — [REC], see decisions).
- **Phase:** pre-lock editable + countdown; post-lock read-only with live tracking; season-end settled points.

### 15. Teams & players `/teams`, `/teams/[id]`, `/players/[id]`
- **Goal:** reference layer feeding pick decisions.
- **Key info:** team: squad (number/position/goals/assists), fixtures/results, mini-form; player: season stats, recent goals (first-scorer relevance flag: "scored first 3× this season" 🔜).
- **Actions:** from player page: "set as first scorer for next fixture" deep-link 🔜.

### 16. Profile & settings `/profile`
- **Goal:** identity + preferences.
- **Key info/actions:** username, avatar (Storage), theme + colorblind mode (parity: `20260617000001_profile_theme.sql`, `_colorblind`), timezone override, default landing league, calendar feed URL (rotate token), account deletion (GDPR-style: anonymize profile, retain league integrity — decision logged), sign out.

### 17. League administration `/league/admin` (organizer)
- **Goal:** configure once, touch rarely.
- **Key info/actions:** league identity (name/label/colour); season enrollment; rule-set editor — enabled categories + weights with live "example scoring" preview; **rules freeze**: editing after season start requires explicit "applies from MW n forward" confirmation and creates a new rule-set version (never rewrites history); reveal policy; prize scheme builder (zero-sum table by rank, or pot split; validates Σ=0 for zero-sum); invite code (view/regenerate); member management; danger zone (archive league).
- **Desktop-first** screen; mobile functional but simplified.

### 18. Data & sync operations `/ops` (platform_admin)
- **Goal:** replace the laptop terminal (`npm run data:fifa:*`) with an operable dashboard.
- **Key info:** per-job health board (last run, status, records, duration, next scheduled), provider quota gauge (today's usage vs plan cap), live-poll status, recent sync_runs table with error drill-down, data anomaly flags (fixtures missing kickoff, results without events, unsettled predictions past FT).
- **Actions:** trigger targeted sync (fixture/round/season scope), re-run scoring for fixture/round (with dry-run diff preview — shows which components would change), raw-payload inspector for a fixture, pause/resume live polling, override a result manually (audited, marks fixture `manual_override`).
- Every action idempotent + audit-logged + rate-limited.

### 19. PWA installation `/install`
- Port of existing page: per-platform instructions (iOS Safari / Android Chrome / desktop), install-state detection, "why install" (push reliability). Shown contextually after first prediction submitted.

### 20. Notification settings `/settings/notifications`
- **Goal:** granular control so notifications stay welcome.
- **Key info/actions:** channel toggles (push per-device list, email), per-type toggles (deadline reminder [lead time selector: 24h/3h/1h], lineups posted, results & my points, rank change, recap ready), quiet hours, test notification button.
- **States:** permission-denied guidance per platform; unsubscribed device cleanup.

## 4.3 Design direction

"Polished modern sports product, not admin dashboard": dark-first theme (old app has theme toggle), club-crest-forward fixture cards, live elements with subtle motion (`framer-motion` retained), score typography as the hero on match surfaces, generous mobile tap targets (score steppers ≥44px). Keep the old app's flag/crest chip and pitch components as the visual seed. A component inventory pass in Phase 1 should produce a small design-system layer (buttons/cards/sheets/tabs/stat-chips) before feature screens are built — the old repo's single `components/ui.tsx` grab-bag should not be recreated.
