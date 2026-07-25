# 5. Domain Model — Competitions & Prediction Markets

## 5.1 Competition/season hierarchy

```
Platform
└── Competition        (Premier League, Champions League, FA Cup, World Cup …)
    └── Season         (PL 2026/27)
        └── Stage      (Regular Season | Group Stage | League Phase | Knockout | …)
            └── Round  ("Matchweek 14", "Group Matchday 2", "Quarter-finals")
                └── Fixture
```

### Competition
`code` (slug), `name`, `kind` (`league` | `cup` | `hybrid` | `tournament`), `region`, `logo`, `provider_refs` via mapping table. A competition is timeless; seasons carry the structure.

### Season
`competition_id`, `label` ("2026/27"), `start_date`, `end_date`, `status` (`upcoming|active|completed`), `is_current`. All prediction locking of season markets keys off `first_kickoff_at` (derived, cached).

### Stage
`season_id`, `name`, `kind`:
- `round_robin` — PL regular season, UCL league phase (single table over N rounds)
- `groups` — WC-style parallel round-robins (stage has child `groups`; standings per group)
- `knockout` — bracket; rounds are knockout rounds; fixtures may have `leg` (1|2) and `tie_id`
- `single_elimination_replay` — FA Cup style (replays as extra fixtures in the same tie) 🧭

`sequence` orders stages. This covers all required formats:

| Required format | Modelled as |
|---|---|
| Round robin (PL) | 1 stage `round_robin` × 38 rounds |
| Knockout (cup from R1) | 1 stage `knockout` |
| Group then knockout (WC) | stage `groups` + stage `knockout` |
| League phase then knockout (UCL 2024+ format) | stage `round_robin` (36-team table, 8 rounds) + stage `knockout` (with playoff round) |
| Hybrid/domestic cups | stage sequence per config; replays/legs on fixtures |

### Round
`stage_id`, `number`, `name`, `starts_at`/`ends_at` (derived from fixtures, cached), `status`. For the PL, Round == Matchweek and is the unit of: entry flow, matchweek leaderboards, recaps, and "gameweek" prizes. **Deadline policy is per-fixture kickoff (not per-round)** — carried from the old app and kept ([REC]; a per-round single deadline is a league-level 🧭 option some groups prefer; schema allows adding `deadline_mode` later).

**Reschedule handling (PL-critical):** a fixture moving weeks (e.g. cup clashes) keeps its identity and its predictions; it may be reassigned `round_id` when the provider does (PL officially keeps postponed games in their original matchweek — [ASSUME] follow provider's round assignment verbatim). Predictions never migrate or reset on reschedule; locks always follow the *current* `kickoff_at`. If kickoff moves **earlier**, notify affected users who haven't predicted.

### Fixture
`round_id`, `home_team_id`, `away_team_id` (FK to canonical teams — **never text**), `kickoff_at timestamptz`, `status` (state machine: `scheduled → lineups → live(1H|HT|2H|ET|pens) → finished → settled`, plus `postponed`, `abandoned`, `awarded`, `cancelled`), `home_score/away_score` (regulation), `ht_score`, `et/pen` fields nullable, `minute`, `venue`, `leg`, `tie_id`, `result_confirmed_at`, `manual_override` flag. Abandoned/awarded fixtures follow an explicit settlement policy (decision logged; default: void fixture markets = 0 points for everyone, notify).

### Teams, players, squads (canonical entities)
- `teams`: id, name, short_name, code, crest_url, country. `team_season_entries` links teams to seasons (a team exists once; plays in PL and FA Cup and UCL).
- `players`: id, name, position, birth info, photo. `squad_memberships`: player↔team↔season with shirt number/position (players transfer mid-season: memberships have `from`/`until`; first-scorer settlement uses the goal event's player identity, not squad membership, so January transfers can't break scoring).
- `player_equivalences` ports the old dedup concept for cross-source identity ([FACT] old `lib/player-equivalence.ts`), now mostly needed for manual merges of provider duplicates.

### Provider mapping
`provider_entity_map(provider, entity_type, provider_id, internal_id)` with unique (provider, entity_type, provider_id). Every synced entity (competition, season, stage?, round, fixture, team, player) maps here. Application code never touches provider IDs — the lesson from the old repo dropping `provider_fixture_id` and per-provider tables (`fifa_teams`).

## 5.2 Prediction-market model

### Concepts
- **MarketType** — the *kind* of question. Static catalog table (seeded, versionable): `code`, `scope` (`fixture` | `round` | `season_stage` | `season`), `answer_schema` (JSON Schema for the prediction value), `settle_schema` (shape of the outcome), `settler` (name of the pure settlement function in code), `display` metadata. Adding a market = new row + settlement function + form widget. No prediction-table migration.
- **Market** — an *instance* of a MarketType attached to a subject: (`market_type_id`, `subject_type`+`subject_id` = fixture / round / season, `opens_at`, `locks_at`, `status`, `outcome jsonb`, `settled_at`, `settle_source`). Fixture markets are created implicitly at fixture import; season markets at season activation.
- **Prediction** — (`user_id`, `market_id`, `value jsonb`, `updated_at`), unique per (user, market). **Global**, not per-league (MVP rule per brief). `prediction_revisions` append-only audit of every change pre-lock ([FACT] parity: old app's revision-history requirement).
- **Settlement** result of scoring a market: outcome recorded on the market; per-user results land as **score components** (see `06-…`).

### MVP market catalog (fixture scope)
| code | value (JSONB) | Settlement notes |
|---|---|---|
| `correct_score` | `{home:int, away:int}` | exact match; also *derives* outcome/GD/TG/BTTS defaults |
| `outcome` | derived from correct_score (not separately submitted in MVP) | sign comparison, as `lib/scoring.ts` |
| `goal_diff` | `{value:int}` nullable → derive | hedgeable override, old-app semantics |
| `total_goals` | `{value:int}` nullable → derive | hedgeable |
| `btts` | `{value:bool}` nullable → derive | hedgeable |
| `first_scoring_team` | `{team_id | "none"}` | `'none'` correct iff 0-0 (goalless), mirroring old `'NONE'` sentinel but on IDs |
| `first_goalscorer` | `{player_id | "none"}` | own goals excluded from "first scorer" ([ASSUME] — matches common convention; decision logged); equivalence map honoured |
| `team_exact_goals` | derived consolation | only when exact missed; off by default (parity) |

Implementation note: the entry form treats these as **one composite fixture prediction** (a single `value` per market, but saved together in one action); the market granularity exists for scoring/analytics, not for making users file 7 separate submissions.

### MVP season markets
`season_champion {team_id}`, `season_top4 {team_ids[4]}` (order-insensitive set), `season_relegation {team_ids[3]}`, `season_golden_boot {player_id}`. Lock at season first kickoff. Settled at season end; **live tracking is display-only** until then.

### Future game modes — representability check (design proof, not MVP)
- **Survivor / last-man-standing:** round-scope market `survivor_pick {team_id}` + a *game-mode state* per league (lives remaining). Needs a `league_game_modes` concept — modes are league-scoped contests over markets; the market layer needs no change.
- **Pick six / accumulator:** round-scope market with `{selections:[…]}` value; settlement = all-or-nothing multiplier.
- **Confidence pools:** per-fixture `confidence {rank}` companion market with per-round uniqueness validation.
- **Rival challenges:** not a market — a league feature comparing existing components.
- **Cup brackets:** stage-scope market `bracket {picks…}` (the old app's `tournament_predictions` generalized).

Conclusion: `scope + JSONB value + named settler` covers all listed modes. The one structural addition to anticipate is `league_game_modes` (league-scoped contest wrapper) — leave room, don't build.

### League-specific predictions (brief asks: evaluate)
**[REC] Keep predictions global for MVP and likely forever for fixture markets.** Evidence: the old app ran a whole tournament this way without user complaints surfacing in the code/README; global predictions are what make multi-league membership effortless and the consensus/reveal features coherent. The real future need is league-specific *game-mode entries* (your survivor pick may differ per league) — which the `league_game_modes` wrapper handles by scoping *those* entries to (league, user), while core fixture predictions stay global. If true per-league fixture predictions are ever demanded, add nullable `league_id` to `predictions` with `(user_id, market_id, coalesce(league_id, ∅))` uniqueness — additive migration, no rewrite. Do not pay that complexity now.
