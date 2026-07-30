# Provider notes — API-Football v3

Findings from Task 6 (cassette capture), recorded 30 July 2026 against a live Free-plan key.
Payloads are committed under `packages/provider/cassettes/` and asserted by
`packages/provider/src/cassettes.test.ts`.

Re-capture with `API_FOOTBALL_KEY=... pnpm cassettes:capture`. Cassettes already on disk are
skipped, so a re-run costs nothing; `FORCE=1` re-records everything.

## 1. What the Free plan can and cannot do

The restriction is on the **`season` parameter**, not on recency, which is a much narrower
limit than it first appears. Probed 31 July 2026:

| Call | Free plan | Notes |
|---|---|---|
| `/teams?league=39&season=2026` | ❌ | `"try from 2022 to 2024"` |
| `/fixtures?league=39&season=2026` | ❌ | Same |
| `/fixtures?league=39&date=…` | ❌ | Passing `league` makes `season` mandatory |
| `/fixtures?next=…` | ❌ | `"Free plans do not have access to the Next parameter"` |
| `/fixtures?date=YYYY-MM-DD` | ⚠️ | Works, but only within **today ±1 day** |
| **`/players/squads?team=33`** | ✅ | Not season-scoped — returns the **current** squad |
| **`/fixtures?live=all`** | ✅ | Not season-scoped — every in-play match, any competition |
| **`/fixtures/events?fixture=…`** | ✅ | Works for current-season and live fixtures |

So the honest position is narrower than "the Free plan is useless for 2026/27":

- **The full 38-matchweek fixture list cannot be obtained from API-Football.** This was
  the one genuine blocker — the whole schedule the predict screen is built on. It is now
  solved from a different source rather than by paying: the Premier League publishes its
  own schedule, clubs and squads as JSON. See §6.
- **Current squads can be.** `/players/squads` takes only a team id, so real 2026/27
  squads are reachable today — enough for the squad-search first-scorer picker, given
  team ids from an accessible season (they are stable: 33 is Manchester United in both).
- **Live shapes can be** — see §3.
- Cassettes are therefore recorded from **season 2024 (2024/25)**. This is not a compromise:
  response shapes belong to the API version rather than the season, and a completed season
  is the only place real event streams, a full table and top scorers exist. In July, 2026/27
  is a fixture list and nothing else.

Set `CASSETTE_SEASON=2026` and re-run the capture once the plan is upgraded, to confirm the
current season's shapes match.

## 2. Two rate limits, and the per-minute one bites first

The documented Free limit is 100 requests/day. There is also an undocumented-in-the-dashboard
per-minute ceiling — a capture run of ~10 quick calls returned `429` partway through. The
capture script now spaces requests by 7s (`REQUEST_SPACING_MS`).

Worth knowing because the ingestion windowing has the same exposure: five concurrent 3pm
kickoffs means one live-list call plus five event calls per poll, and bunching those into the
same second is how a matchday starts failing.

Errors arrive as **HTTP 200 with a non-empty `errors` object**, not as a 4xx. `ApiFootballAdapter`
already treats that as a failure and reports quota stops as 429 so the breaker
cools down rather than treating it as permanent.

## 3. Live shapes — verified, on the Free plan

Previously listed as unclosable before MW1, on the assumption that the Free plan could not
reach anything in play. It can: `/fixtures?live=all` is not season-scoped.

Captured 31 July 2026 across two samples 90 seconds apart (`pnpm cassettes:live`), asserted
by `live-cassettes.test.ts`:

- In-play status codes observed: **`1H`, `HT`, `2H`, `ET`** → `live`, `ht`, `live`, `live`.
  `ET` matters: mapping extra time to `finished` would settle a match still being played.
- `status.elapsed` parses, and **advanced in all three followed fixtures** between samples
  (29'→31', 46'→48', 98'→100'), so the live centre's clock is real rather than static.
- `goals` are populated mid-match, which is what provisional scoring reads.

**A live goal event may have `player: null`.** One captured fixture — a club friendly —
published two goals with no scorer attributed, while the two league fixtures named theirs.
Attribution depends on the competition's coverage level and arrives later. Consequences:

- Events must be kept with a null `player_id` rather than dropped, or the event list
  disagrees with the scoreline. `writeEvents` already does this.
- A first-scorer market settled from a live stream could score every pick as a miss.
  Settlement runs from the finalisation re-fetch, not the live stream, which is where the
  attribution has arrived — one more reason that path exists.

## 4. Event shapes — verified, including the trap

Captured from real fixtures in 2024/25:

| Provider payload | Normalised | Notes |
|---|---|---|
| `{type:"Goal", detail:"Normal Goal"}` | `goal` | |
| `{type:"Goal", detail:"Penalty"}` | `penalty_goal` | |
| `{type:"Goal", detail:"Own Goal"}` | `own_goal` | Counts for the opposing team; no first-scorer pick can hit it |
| `{type:"Card", detail:"Red Card"}` | `red` | |
| `{type:"Card", detail:"Yellow Card"}` | `yellow` | |
| `{type:"subst", detail:"Substitution 1"}` | `substitution` | Note the lowercase type |
| `{type:"Var", detail:"Penalty confirmed"}` | `var` | **The trap** |

The VAR line is the one to be careful about: its detail contains the word "Penalty", so a
naive `/penalty/` match on detail classifies it as a goal. That would invent a goal that
never happened and could move first-scorer points to the wrong player. `normalizeEventType`
matches on `type` first, which is why it survives this.

**Not yet captured: `missed_penalty`.** Twelve event calls across the highest-scoring
fixtures of 2024/25 turned up none. The branch exists and is unit-tested against a
constructed payload, but it is the one event shape with no real capture behind it.

## 5. Confirmed data quality on a full season

Asserted in `cassettes.test.ts` against 2024/25:

- 20 teams, 380 fixtures, 38 matchweeks, no gaps
- **Every fixture parses a round number** — `league.round` is consistently
  `"Regular Season - N"`. A null here would mean a fixture the bootstrap silently drops.
- Standings are internally consistent: `points === won * 3 + drawn`, and
  `won + drawn + lost === played === 38` for all 20 rows
- Squads return 30–41 players with positions and shirt numbers
- Event keys are unique within a fixture and stable across identical calls, which is what
  makes the `(fixture_id, provider_event_key)` upsert idempotent under repeated polling

## 6. The schedule comes from the Premier League, not from API-Football

`FplAdapter` (`packages/provider/src/fpl.ts`) reads two unauthenticated endpoints:

```
/api/bootstrap-static/   20 clubs, ~560 players with club and position, 38 gameweeks
/api/fixtures/           380 fixtures with kickoff times and gameweek numbers
```

That is the entire dataset the free API-Football plan withholds, at no cost and with no
scraping — it is the JSON API behind the PL's own fantasy game, parsed as data rather than
lifted out of rendered HTML. A full bootstrap costs **two HTTP requests** and about 15
seconds, and squads come free because they are already inside the cached bootstrap payload
(API-Football would charge one request per club).

Verified in `fpl.test.ts` against committed cassettes: 20 clubs each playing 38 games, 380
unique ordered pairings, 38 gameweeks of exactly 10 fixtures, every fixture with a
parseable kickoff. Structural rather than superficial, because a fixture list that is 372
games long produces an app that looks fine and is quietly wrong.

**It is undocumented and unversioned.** No SLA, and the shape can change without notice.
Mitigations: responses are archived to `raw_payloads` like any other provider, the
normalizers are pinned by cassettes, and it implements the narrow `ScheduleProvider`
interface rather than the full adapter — it has no usable event stream, and serving
first-goalscorer from it is exactly the mistake that interface prevents.

`fixture.finished` also lags the final whistle (it flips when fantasy points are
confirmed), so it never drives settlement. Settlement runs from API-Football's status.

### The gap this leaves

The bootstrap now writes `provider_entity_map` rows under the provider `fpl`. The live and
finalisation jobs resolve fixtures under `api-football`, and those rows do not exist — so
against an FPL-bootstrapped season the live sync currently matches nothing and reports it
as `unmatched` rather than failing.

Closing it needs a reconciliation step that matches the two providers' fixtures by kickoff
and club, which cannot use API-Football's season-scoped fixture list on the free plan and
so has to work from the live list at match time. Club names differ between the sources
("Man Utd" vs "Manchester United"), so it needs an alias table and its own tests.
## 7. Open questions

- **Corrections have not been observed.** The `result_hash` re-check in `sync-final.ts` is
  built for provider revisions after full time, but no real correction pair has been
  captured. Worth watching `raw_payloads` for the first few matchweeks.
- **Fixture id stability across a reschedule** is assumed, not proven. If a rearranged
  fixture arrives with a new provider id, `provider_entity_map` would create a duplicate
  fixture rather than move the existing one.
- **A full Premier League matchday has not been observed.** The live capture followed
  friendlies and a Conference League tie. The shapes are competition-independent, but the
  *volume* — ten simultaneous fixtures, each polled — has only been modelled, in
  `windows.test.ts`, never run.

