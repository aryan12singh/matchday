# 3. Product Vision, Personas, Feature Inventory, MVP & Roadmap

## 3.1 Personas & jobs-to-be-done

**P1 — The Regular ("core friend").** Plays in 1–2 private leagues with people they know. JTBD: *"Before Saturday, let me submit my whole matchweek in under 3 minutes on my phone, and during matches show me whether I'm winning."* Cares about: fast entry, deadline reminders, live provisional points, banter fuel (H2H, recaps). Frustration to avoid: re-entering picks per league (solved: global predictions).

**P2 — The Strategist.** (Matches the current app's power users.) Studies fixtures, hedges GD/total-goals/BTTS independently, times first-scorer picks around lineups. JTBD: *"Let me see lineups the moment they drop and adjust my first-scorer pick before kickoff; show me exactly where every point came from."* Cares about: transparency of scoring, breakdowns, differentials vs rivals, consensus views after reveal.

**P3 — The Organizer.** Creates the league, sets rules and stakes, chases stragglers. JTBD: *"Let me configure scoring/prizes once, invite friends with a code, and never have to touch admin again all season."* Cares about: rule clarity (rendered from the actual rule set), member management, prize settlement math, nudging non-submitters.

**P4 — The Casual.** Joins because friends did; predicts scorelines only, skips advanced markets. JTBD: *"Don't make me think — quick-pick sensible defaults and one-tap submit."* Design consequence: advanced markets must be optional per league and progressive-disclosure in the form.

**P5 — The Platform Admin (owner/devs).** JTBD: *"Tell me when sync is unhealthy before users notice; let me repair a fixture/result and re-score safely from a dashboard, not a laptop terminal."*

## 3.2 Feature inventory

Legend: ✅ MVP · 🔜 post-MVP (roadmapped) · 🧭 designed-for, not scheduled.

### Accounts & identity
- ✅ Email/password + magic link auth (Supabase), profile (username, avatar, theme, colorblind mode — parity with old app)
- ✅ Multiple leagues per user; active-league switcher
- 🔜 OAuth (Google/Apple)

### Leagues
- ✅ Create private league, invite code (hidden after join, regenerable), join flow
- ✅ League settings: enabled market categories, weights (via rule-set binding), reveal policy (hidden until kickoff / always visible / after own submission), prize scheme on/off, season enrollment (PL 2026/27)
- ✅ Roles: organizer / member (organizer ≠ platform admin)
- ✅ League activity feed (joins, submissions count, results scored, rank changes) — port of `league_events`
- 🔜 Multi-competition leagues (league enrolls in ≥2 seasons; combined + per-competition boards)
- 🔜 Season rollover: "renew league for 2027/28" (same members, fresh season standing) — schema supports from day one via `league_seasons`
- 🧭 Public leagues, discovery, paid organizer tier

### Predictions
- ✅ Fixture markets: correct score (primary), outcome (derived), goal difference (hedgeable), total goals (hedgeable), BTTS (hedgeable), first-scoring team, first goalscorer (incl. "no scorer")
- ✅ Global prediction per fixture reused across leagues (validated in prod by old app)
- ✅ Full-matchweek entry flow (all 10 PL fixtures on one screen, per-fixture quick save + save-all)
- ✅ DB-enforced kickoff locks + revision history (audit table)
- ✅ Season markets at season start: Champion, Top 4, Relegation (3), Golden Boot; lock at first kickoff of the season; mid-season re-pick windows 🧭 (design decision logged)
- 🔜 Confidence/banker pick (one per matchweek, multiplier) — market model supports; excluded from MVP to keep scoring simple to explain
- 🔜 Most assists, Golden Glove, full-table order, club points totals
- 🧭 Survivor, last-man-standing, pick six, confidence pools, rival challenges, weekly accumulators, cup brackets (all representable as market types / game modes — see `05-domain-model.md`)

### Scoring & competition
- ✅ Versioned rule sets; per-league weights; category score components; re-runs after corrections; full audit
- ✅ Matchweek + overall leaderboards with ported tiebreak chain; rank snapshots & movement
- ✅ Provisional live points during matches (computed from live score, clearly marked provisional)
- ✅ H2H comparison; points-race chart
- ✅ Matchweek recap (auto-generated: winner, biggest riser, best pick, worst miss) + share card
- ✅ Prize schemes: configurable zero-sum (generalizing the old 7-player table) + simple pot split; settlement ledger
- 🔜 Achievement badges (port concept later; not MVP)
- 🔜 Consensus/prediction wall views post-reveal

### Football data & content
- ✅ Fixtures & results by matchweek; competition table; team pages; squads; top scorers (Golden Boot table)
- ✅ Match page: events timeline, lineups with formation pitch, subs, cards, stats (possession/shots/xG where provider supplies), live minute
- ✅ Live centre (today's matches, live scores, my provisional points)
- 🔜 Injuries/suspensions surfaced on prediction form (provider-dependent)
- 🧭 News

### Platform
- ✅ Automated ingestion (see `08-…`), admin sync-health dashboard, manual repair actions
- ✅ PWA (installable, offline shell), push deadline reminders, per-user ICS calendar feed
- ✅ Email reminders fallback (Resend)
- ✅ Notification settings (per-type toggles, lead time)
- 🔜 Result-scored / rank-change notifications
- 🧭 Digest emails

## 3.3 MVP scope (must all be true to launch the private beta)

1. A user can sign up, create/join a league via code, and enroll it in Premier League 2026/27.
2. All PL fixtures for the season are imported automatically and stay current through reschedules (PL reschedules constantly for TV — this is core, not edge).
3. A user can submit and edit the seven fixture markets for a full matchweek on mobile in one flow, until each fixture's kickoff, with DB-level lock enforcement.
4. Season markets (champion, top 4, relegation, Golden Boot) can be submitted before the season's first kickoff.
5. Live scores flow within ~60–90s of real events on match days; the live centre shows provisional points.
6. Within minutes of full-time results confirming, scoring runs automatically, score components are written, and matchweek + overall leaderboards update — with the ability to re-run cleanly if the provider corrects a result.
7. Each league applies its own weights/enabled categories/reveal policy/prize scheme to the shared predictions.
8. Push + email deadline reminders fire without human intervention.
9. Admin can see sync health and trigger targeted repairs from the UI.
10. `npm run check`-equivalent CI passes: scoring golden-vector tests, RLS integration tests, typecheck, build.

**Explicit non-goals for MVP** (each was consciously cut): confidence picks, badges, consensus wall, multi-competition leagues, public leagues, injuries UI, any second competition, native apps, i18n, betting-odds display.

## 3.4 Post-MVP roadmap (ordered)

1. **Hardening pass** (weeks 1–3 after launch): observability alerts, edge-case backlog from live usage, provider-correction drills.
2. **Second competition: Champions League 2026/27** — proves league-phase→knockout Stage model and multi-competition leagues; adds cup-tie semantics (two-legged, extra time — decide 90-minute-result-only scoring policy, see decisions file).
3. **Confidence/banker pick + badges + consensus wall** — engagement layer.
4. **More season markets** (assists, Golden Glove, table order) + mid-season market windows.
5. **Season rollover UX** for 2027/28.
6. **Game modes v1**: survivor + last-man-standing (simplest new modes; pure market-type + settlement additions).
7. **Public-readiness track** (only if desired): public league discovery, moderation, organizer tier, billing — plus a legal review of prize pools (see risks).
