# MatchDay v2 — Discovery Pack

**Purpose:** everything Claude Code needs to build the successor to `calebsooon/wc26-predictor` (World Cup 2026 prediction app) as a competition-agnostic, season-long football prediction platform, starting with the Premier League.

**Status:** Discovery only. No implementation has started. This pack was produced by auditing the actual `wc26-predictor` repository (cloned 2026-07-17, ~26,900 lines of TS/TSX, 2,589 lines of SQL across 51 migrations, 13 test files) plus current provider pricing research.

> **⚠️ READ `15-owner-decisions-addendum.md` SECOND (right after this file).** It records the product owner's decisions from 18 Jul 2026, adds two new MVP features (league fixture selection/voting; season table predictor), finalizes hosting, and replaces the launch calendar with a hard-deadline plan (live before PL MW1, Fri 21 Aug 2026). **Where it conflicts with files 03–14, the addendum wins.**

---

## How to use this pack with Claude Code

1. Create a fresh empty repository (recommendation: `matchday` — see `11-repo-strategy.md` for why a clean repo beats forking).
2. Copy this entire `matchday-discovery/` folder into the new repo as `docs/discovery/`.
3. Copy `CLAUDE.md` from this pack into the repo **root** (Claude Code reads it automatically every session).
4. Resolve the decisions in `13-decisions-and-open-questions.md` — several are blocking (marked ⛔). Write your answers directly into that file so Claude Code sees them.
5. Start Claude Code and prompt it with something like:

```
Read CLAUDE.md, docs/discovery/00-START-HERE.md, then docs/discovery/15-owner-decisions-addendum.md
(it supersedes conflicts in files 03-14), then docs/discovery/14-implementation-phases-tasks.md
using the revised calendar in the addendum's section G.
Then begin Task 1. Do not skip ahead; each task lists its dependencies.
```

6. Keep the old repo cloned locally next to the new one (e.g. `../wc26-predictor`) — the porting tasks in `11-repo-strategy.md` reference specific files in it to copy/adapt.

## File index (read in this order)

| File | Covers (brief §) |
|---|---|
| `01-executive-summary.md` | Recommendation, product directions, chosen direction (§1, 5, 6) |
| `02-existing-app-audit.md` | Repo audit, reusable assets, tech debt (§2, 3, 4) |
| `03-product-vision-scope.md` | Personas, JTBD, feature inventory, MVP, roadmap (§7–10) |
| `04-screens-and-ia.md` | Information architecture + all screen specs (§11, 12) |
| `05-domain-model.md` | Competition/season model + prediction-market model (§13, 14) |
| `06-scoring-leaderboards-prizes.md` | Scoring, leaderboard, prize architecture (§15, 16) |
| `07-provider-comparison.md` | API-Football vs Sportmonks vs football-data.org (§17) |
| `08-data-ingestion-and-jobs.md` | Sync system, scheduling, notifications (§18, 21) |
| `09-database-schema.md` | Full proposed schema (§19) |
| `10-security-and-rls.md` | RLS + security model (§20) |
| `11-repo-strategy.md` | Repo structure, module map, port/rewrite/retire list (§22, 23) |
| `12-testing-ops-costs.md` | Testing, observability, infra + monthly cost (§24–26) |
| `13-decisions-and-open-questions.md` | Risks, open questions, decisions before coding (§27, 30) |
| `14-implementation-phases-tasks.md` | Phases + first 20 tasks in dependency order (§28, 29) |
| `15-owner-decisions-addendum.md` | **Owner decisions 18 Jul 2026 — supersedes conflicts in 03–14.** New features (fixture selection/voting, table predictor), final hosting, 5-week launch plan |
| `CLAUDE.md` | Drop into repo root for Claude Code |

## Evidence conventions used throughout

- **[FACT]** — verified directly in the `wc26-predictor` source, with file paths.
- **[INFER]** — inferred from the code/README but not directly runnable-verified.
- **[REC]** — a recommendation; alternatives and trade-offs are given where they matter.
- **[ASSUME]** — an assumption made where information was missing; all assumptions are also collected in `13-decisions-and-open-questions.md`.

Pricing figures were checked against public sources in July 2026 and **must be re-verified on the providers' official pricing pages before purchase** — they change.
