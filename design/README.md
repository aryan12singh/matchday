# Handoff: MatchDay v2 — "Dual Signal / Premium Broadcast"

## Overview
Complete visual identity + UI for MatchDay, a season-long football prediction platform for private leagues of friends (PL 2026/27, competition-agnostic). This bundle contains the design tokens, logo assets, component references, and eight high-fidelity screen designs (v2 "Premium Broadcast" iteration — the approved direction).

## About the Design Files
The `.dc.html` files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, NOT production code to copy directly. The task is to **recreate these designs in the target codebase** (Tailwind + React, per project constraints) using its established patterns. The CSS tokens and Tailwind theme config, however, ARE drop-in ready.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and copy are final. Recreate pixel-perfectly. All values reference CSS variables — never hardcode hex in product code (this enables dark/light and a planned user-facing colorway switcher).

## Drop-in files (use as-is)
- `tokens/colors.css` — all color custom properties. Dark IS `:root`; light mode = `[data-theme="light"]` on `<html>`.
- `tokens/typography.css` — font tokens + Google Fonts import (Archivo, Chivo Mono, Public Sans).
- `tokens/spacing.css` — spacing/radius/elevation/tap-target tokens.
- `tailwind.theme.js` — Tailwind `theme.extend` mapped to the CSS vars, with usage notes. Drop into tailwind.config.
- `assets/` — logo SVGs: `icon.svg` (PWA icon, works at 32px), mono variants, `wordmark.svg` (+mono/on-light; pure outlined paths, no font dependency), `colon-glyph.svg`.

## Brand rules (non-negotiable)
1. **Volt `--accent` #CBFF3A = the USER**: their actions, picks, CTAs, submitted state.
2. **Coral `--live` #FF4E3E = THE GAME**: live state, in-play, kickoff urgency. Never swap the two; never use either as decoration.
3. Every number renders in Chivo Mono with `font-variant-numeric: tabular-nums` (`font-num tabular-nums`).
4. Archivo 800/900 uppercase for display/labels/CTAs (letter-spacing .12em on labels); Public Sans for body.
5. Success/danger only for points won/lost & correctness. Locked = gray (never red). Void = dashed border + ~55% opacity.
6. All money UI (`--prize` gold) is conditional on `league.prizeSchemeId != null` — points-only leagues render none of it, app-wide.
7. Team identity = neutral monogram chips (2–3 letters on `--surface-3` circle). NEVER club crests, club colors, or PL marks (legal).
8. Copy tone: cheeky-specific between friends ("12 pts behind Dan. Sort it out."). No emoji in UI chrome. Never corporate.

## Surface hierarchy (v2)
Cards earn their border — only interactive/expandable/stateful things get `--surface` + 1px `--border` + radius 10. Everything else:
- Page bg `--bg` with open sections separated by 1px dividers.
- Full-bleed hero bands: radial tint (`radial-gradient(... #12150C → --bg)` volt-phase, `#170D0C` live-phase, `#171204` winner-gold, `#0D140F` settled-green).
- State rails: 3px left border in the state color.
- Live pulse: 1.6s opacity keyframe on the DOT only, never whole cards. Respect `prefers-reduced-motion`.

## Screens (see `screens/` folder — each has mobile 390px + desktop)
1. **Home v2** — adaptive hero with 4 phases (pre-deadline / live / settled / quiet week). Countdown in num-mega, 10-block progress track, borderless live strip + results rows.
2. **Predict v2** — score steppers (44px+ targets), autosave ("Saved automatically · editable until each kickoff" — no save button), per-fixture lock times, "next to lock" rail, Incomplete/All/Included filters, labels "Included in The Boot Room" / "Not selected for this league", 5 fixture states + skeleton/empty/save-conflict states (see v1 Predict for state specs).
3. **Live Match v2** — THE signature screen. 72–84px scoreline, "Projected +6 · not final", category tracker (alive/confirmed/dead with break conditions), consequence strip ("If it stays 2:1 → you jump Dan into #2"), league picks vs consensus toggle, vertical timeline with CALLED IT badge, VAR-correction disclaimer.
4. **Leaderboard v2** — podium top-3, my-context strip (distance above/below), form dots (last 5 vs median), live/settled toggle, "what changed" summary, expandable breakdown rows, standard/detailed desktop toggle, Table race tab (drift scoring).
5. **Season Table v2** — 20-team reorder with drag + ▲▼ + search + fill-from-current + undo, scoring explainer pre-lock; post-lock: drift stats, biggest hit/miss/hot-take strip, consensus column, per-team drift bars.
6. **League Home (new)** — clubhouse: league badge (pennant in custom league accent), motto, member avatars, weekly winner strip, rivalry module, trophy cabinet, records, activity/banter feed with reactions.
7. **Recap (new)** — winner hero, week-in-numbers, story beats (Call of the week / Shocker / Streak / Table), rank-race chart, 1080×1350 shareable winner card. Celebration scale: ordinary points = nothing; exact score = pulse + CALLED IT; MW win = hero + share card; perfect week = the ONLY confetti.
8. **System Sheet v2** — brand devices, surface hierarchy, type scale, v1→v2 change log. Read this first.

## Interactions & Behavior
- Autosave every prediction change; optimistic UI with "✓ saved" tick. Save conflict at kickoff → inline danger banner "Locked at kickoff — not saved", earlier pick stands.
- Live provisional points update via socket/poll; animate projected→settled transition at FT.
- Leaderboard rows expand on tap (per-category breakdown). Ties broken by exact scores — show deciding tiebreak.
- Desktop: keyboard nav (Tab to next incomplete fixture, +/− adjusts scores), ⌘K palette, visible focus ring `--focus-ring` 2px offset.
- Reduced motion: pulses → static dots; count-ups render final value.

## State Management (per screen)
- Fixture: editable | locked | live | settled | void. Prediction: unpredicted | draft-saved | locked.
- Home hero phase: pre-deadline | live | settled | quiet (derived from matchweek state).
- Leaderboard: live-vs-settled toggle; standings recompute on score-run settle (stamp run id + time).
- Season table: pre-lock (reorderable) | locked (read-only + live drift vs current table).

## Accessibility
WCAG AA contrast throughout. State never by color alone (pulse+rail+label for live; padlock for locked; dash for void; ✓/✕ for win/loss). Text floors: body 14, secondary 13, metadata 12.5. Tap targets ≥44px. Long names truncate with tooltip; missing crest falls back to monogram (default).

## Assets
All in `assets/` — original SVGs created for this project, no licensed material. Player/stadium imagery is NOT included; screens use neutral placeholders by design (legal constraint).

## Screenshots
\`screenshots/01–08\` — one PNG per screen (each canvas shows mobile 390px + desktop side by side, plus state variants). Use these as the visual ground truth alongside the HTML markup.

## Files
- `screens/*.dc.html` — v2 screen references (+ v1 baseline for state specs)
- `components/` — 11 React reference components (.jsx) with .d.ts props and usage notes (.prompt.md): Button, TeamChip, ScoreStepper, CountdownChip, StateBadge, CountsBadge, PrizeTag, VoteTallyBar, FixtureCard, LeaderboardRow, LiveMatchCard
- `SKILL.md`, `readme.md` — system rules and rationale
Note: .dc.html files use a proprietary template runtime — read them for markup/values, don't execute them outside this tool.
