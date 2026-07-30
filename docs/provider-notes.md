# Provider notes — API-Football v3

Findings from Task 6 (cassette capture), recorded 30 July 2026 against a live Free-plan key.
Payloads are committed under `packages/provider/cassettes/` and asserted by
`packages/provider/src/cassettes.test.ts`.

Re-capture with `API_FOOTBALL_KEY=... pnpm cassettes:capture`. Cassettes already on disk are
skipped, so a re-run costs nothing; `FORCE=1` re-records everything.

## 1. The Free plan is season-limited, not just rate-limited

This is the finding that changes the plan, and it is not visible in the pricing table:

```
GET /teams?league=39&season=2026
→ 200 {"errors":{"plan":"Free plans do not have access to this season, try from 2022 to 2024."}}
```

The Free plan cannot read season 2026 **at all**. Not a smaller quota — no access. So:

- **The real PL 2026/27 bootstrap (T9) cannot run on the Free plan.** A paid plan is
  required to load the season, not merely to survive matchday polling.
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

## 3. Event shapes — verified, including the trap

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

## 4. Confirmed data quality on a full season

Asserted in `cassettes.test.ts` against 2024/25:

- 20 teams, 380 fixtures, 38 matchweeks, no gaps
- **Every fixture parses a round number** — `league.round` is consistently
  `"Regular Season - N"`. A null here would mean a fixture the bootstrap silently drops.
- Standings are internally consistent: `points === won * 3 + drawn`, and
  `won + drawn + lost === played === 38` for all 20 rows
- Squads return 30–41 players with positions and shirt numbers
- Event keys are unique within a fixture and stable across identical calls, which is what
  makes the `(fixture_id, provider_event_key)` upsert idempotent under repeated polling

## 5. Open questions

- **Live shapes are still unverified.** In July there is nothing in play, so the
  `live=all` cassette is an empty response. `elapsed`, in-play `status.short` transitions
  (`1H`/`HT`/`2H`) and the behaviour of `goals` mid-match have not been seen on real data.
  Capture during the first pre-season friendly or MW1 and re-verify.
- **Corrections have not been observed.** The `result_hash` re-check in `sync-final.ts` is
  built for provider revisions after full time, but no real correction pair has been
  captured. Worth watching `raw_payloads` for the first few matchweeks.
- **Fixture id stability across a reschedule** is assumed, not proven. If a rearranged
  fixture arrives with a new provider id, `provider_entity_map` would create a duplicate
  fixture rather than move the existing one.
