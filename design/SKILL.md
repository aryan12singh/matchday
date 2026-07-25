# MatchDay — "Dual Signal" design system

Use this skill when designing ANY MatchDay surface. Dark-first football-prediction app for private leagues. Full rationale in readme.md; sources in uploads/.

## Non-negotiables
1. Load `styles.css` (tokens) and style with the CSS variables — never hex literals in product surfaces (enables theme + future colorway switching).
2. **Volt --accent = the user** (actions, picks, CTAs, submitted). **Coral --live = the game** (in-play, kickoff urgency). Never swap, never use either as decoration.
3. Every number in Chivo Mono (--font-num) with tabular-nums: scores, ranks, countdowns, minutes, money.
4. Archivo for display/labels/CTAs (uppercase, .12em tracking); Public Sans body. No other fonts.
5. Cards: --surface + 1px --border, radius 10. State accents as a 3px left border. Live pulse = the dot only (mdpulse keyframe), 1.6s.
6. Success/danger ONLY for points won/lost & correctness. Locked = gray --locked, never red. Void = dashed border + 60% opacity.
7. Money UI (--prize gold) must be conditional — points-only leagues render none of it.
8. Team identity = neutral monogram chips (--surface-3 circle, 2-3 letters). NEVER club crests/colors/PL marks.
9. Tap targets ≥44px. WCAG AA on all text. Every data region: skeleton / empty-with-CTA / inline-retry failure.
10. Copy is cheeky-specific between friends ("12 pts behind Dan. Sort it out."), no emoji, no corporate voice.

## Files
- tokens: styles.css → tokens/{colors,typography,spacing}.css · Tailwind: handoff/tailwind.theme.js
- logo: assets/icon.svg (+mono variants), assets/wordmark.svg (+mono/on-light), assets/colon-glyph.svg
- components/core/*.jsx (+.d.ts +.prompt.md): Button, TeamChip, ScoreStepper, CountdownChip, StateBadge, CountsBadge, PrizeTag, VoteTallyBar, FixtureCard, LeaderboardRow, LiveMatchCard
- reference screens: Home, Predict, Season Table, Fixture Voting, Leaderboard, Live Match (.dc.html) — copy patterns from these, don't reinvent.
