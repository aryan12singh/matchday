# 7. Football Data Provider Comparison

Sources: providers' public pricing/coverage pages and independent comparisons, checked July 2026. **Prices and quotas change — re-verify on the official pricing pages (api-football.com/pricing, sportmonks.com/football-api/plans-pricing, football-data.org) before subscribing.** Figures below are the best-available current numbers, labelled with confidence.

## 7.1 What MatchDay actually needs from a provider

Per MVP requirements: PL fixtures + reschedules; live scores/minute/status at ~60s cadence; goal events **with scorer and minute** (first-goalscorer market depends on this — it's the discriminating requirement); lineups + formations + subs; cards; match stats (possession/shots, xG nice-to-have); standings; teams/squads/players; top scorers; injuries nice-to-have. Later: UCL/La Liga/etc. without re-integration.

## 7.2 Candidates

### API-Football (api-sports.io)
- **Pricing [medium-high confidence]:** Free 100 req/day (all endpoints, all competitions, recent seasons); **Pro $19/mo ≈ 7,500 req/day**; Ultra $29/mo ≈ 75,000/day; Mega $39/mo ≈ 150,000/day. Daily quotas reset 00:00 UTC; per-minute rate limits apply per plan (verify current values; free tier is ~10/min).
- **Coverage:** 1,100+ competitions incl. everything on our roadmap; endpoints for fixtures, events (goals w/ scorer+assist+minute), lineups (formations, starters/bench, coach), statistics (incl. xG on many top-league fixtures), standings, squads/players, injuries, top scorers, transfers, odds, "predictions".
- **Live cadence:** live fixture data updated ~every 15s provider-side; one call (`fixtures?live=…` or league-scoped) returns **all** in-play matches with events — extremely quota-efficient for our polling model.
- **Fit notes:** flat JSON, well-trodden by hobby/indie projects; data quality is good-not-perfect for top leagues (occasional slow lineup posts or event corrections — our correction-rerun design absorbs this); daily-cap model suits steady polling but punishes accidental tight loops (client must self-throttle + track quota).

### Sportmonks
- **Pricing [medium confidence]:** free plan = 2 leagues only (Danish Superliga + Scottish Premiership) — unusable for us except integration testing; paid plans are **per-league-selection** tiers (Starter ~€29/mo ≈ 5 leagues, European/Worldwide higher; xG and advanced features on higher tiers; 3,000 calls/hour class rate limits; 14-day trial). Realistic config for PL+UCL with full features lands **€49–100+/mo**.
- **Coverage/quality:** 2,500+ leagues; generally regarded as higher data quality/depth than API-Football (validated scout pipeline, strong lineup/xG data); excellent docs.
- **Fit notes:** best data quality of the three at indie-accessible prices, but 2–5× the cost, and per-league packaging means each roadmap competition raises the bill. Right choice if/when data quality complaints emerge at scale.

### football-data.org
- **Pricing [medium-high confidence]:** free forever tier: 12 competitions (incl. PL, top-5 leagues, UCL) at 10 req/min with **delayed (non-live) scores**; paid tiers from ~€12–29/mo plus add-ons (livescores ~€12, deeper data ~€29, statistics ~€15) that stack to €70+/mo for full needs.
- **Coverage gaps [high confidence for our needs]:** no/limited lineups and per-goal event detail on accessible tiers; player-level data thin. **Fails the first-goalscorer requirement** without expensive add-ons, and 10 req/min complicates live matchdays.
- **Fit notes:** wonderful free prototyping API; not sufficient as the production source for this product.

### (Considered, not required by brief)
TheStatsAPI ($50/mo flat, monthly pool, xG-first) and Sportradar/Opta (enterprise, sales-gated) — noted as future alternatives; the adapter layer keeps them reachable.

## 7.3 Comparison against the brief's criteria

| Criterion | API-Football | Sportmonks | football-data.org |
|---|---|---|---|
| Dev effort to integrate | Low (simple REST, huge community examples) | Low-Med (includes/relations syntax) | Low but insufficient endpoints |
| Monthly cost (MVP: PL only) | **$19** | ~€29–49 | €0 (but can't do the product) / €40–70 with add-ons |
| Cost at 3–4 competitions | $19 (same plan) | €49–100+ | €70+ |
| Reliability/quality | Good; occasional corrections | **Best of three** | Good for what it covers |
| Scalability (quota) | 7,500/day fine for ≤3 comps; upgrade path $29/$39 | 3,000/hr ample | 10/min limiting |
| Vendor lock-in | Low (adapter + raw archive) | Low (same) | Low |
| First-goalscorer data | ✅ events w/ scorer+minute | ✅ | ❌ (accessible tiers) |
| Lineups/formations | ✅ | ✅ (stronger) | ❌/limited |
| xG | Partial (top fixtures) | ✅ (higher tiers) | ❌ |
| Injuries | ✅ endpoint | ✅ | ❌ |
| Operational burden | Quota tracking needed (daily cap) | League-selection admin | Rate-limit juggling |

## 7.4 Recommendation

**[REC] API-Football Pro ($19/mo) for the private beta**, for three reasons: (1) it's the only sub-$30 option that covers every required data type including per-goal scorer events and lineups; (2) one plan covers the entire competition roadmap — adding UCL costs $0; (3) quota math is comfortable: a full PL Saturday ≈ 1 live call/min × ~7h window ≈ 420 calls + lineups (10) + fixtures/standings/squads refreshes (≤100) ≈ **<600 of 7,500**; a whole normal day is <300.

**Mitigations for its known weaknesses (mandatory, not optional):**
- Adapter layer + raw payload archive + `provider_entity_map` so a later switch to Sportmonks is a new adapter + entity remap, not an app rewrite (this is the brief's hard requirement anyway).
- Quota ledger + circuit breaker (stop polling at 90% daily quota, alert admin) because daily caps fail closed at midnight UTC.
- Correction-tolerant scoring (already designed) because API-Football does revise events post-match.
- Trial plan: build the adapter against the **free tier** (100/day is enough for development with recorded fixtures/cassettes), subscribe to Pro only at beta start.

**Switch triggers to Sportmonks:** recurring event/lineup accuracy complaints from users, need for reliable xG across all fixtures, or a paid product tier that justifies €49+/mo for quality headroom.
