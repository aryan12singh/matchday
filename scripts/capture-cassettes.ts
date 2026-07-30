/**
 * Task 6 — capture provider cassettes.
 *
 *   API_FOOTBALL_KEY=... pnpm cassettes:capture
 *
 * Records real API-Football responses into packages/provider/cassettes/ so the normalizers
 * and every ingestion job can be tested against payloads the provider actually sent,
 * forever, without a key and without spending quota.
 *
 * Frugality is the design constraint: the free tier is 100 requests/day. Anything already
 * on disk is skipped, so re-running costs nothing and adding one new cassette costs one
 * request. `FORCE=1` re-records everything, which is what to use when a shape changes.
 *
 * Recorded from a completed season rather than the one the app runs on — see SEASON below
 * for why that is both forced and preferable.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ApiFootballAdapter,
  type Cassette,
  MemoryCassetteStore,
  type ProviderAdapter,
  type ProviderRequest,
  RecordingAdapter,
  ReplayAdapter,
  type SeasonRef,
  cassetteName,
  requests,
} from '@matchday/provider';

const CASSETTE_DIR = join(process.cwd(), 'packages/provider/cassettes');
const LEAGUE = process.env.API_FOOTBALL_LEAGUE_ID ?? '39';
const FORCE = process.env.FORCE === '1';

/**
 * The season to record from — NOT the season the app runs on.
 *
 * The free plan is season-limited, not merely rate-limited: it answers
 * "Free plans do not have access to this season, try from 2022 to 2024" for anything
 * outside that window, so 2026/27 cannot be read at all without a paid plan.
 *
 * That is fine for cassettes. Response *shapes* are a property of the API version, not of
 * the season, so a completed season is strictly better to record from: it has real results,
 * real event streams and a full table, where 2026 in July is a fixture list and nothing
 * else. Override with CASSETTE_SEASON once the plan allows it.
 */
const SEASON = Number(process.env.CASSETTE_SEASON ?? 2024);

/** How many extra event calls the edge-case hunt may spend looking for penalties/own goals. */
const HUNT_BUDGET = Number(process.env.HUNT_BUDGET ?? 12);

const key = process.env.API_FOOTBALL_KEY;
if (!key) {
  console.error('API_FOOTBALL_KEY is not set.');
  process.exit(1);
}

let spent = 0;
const store = new MemoryCassetteStore();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The free tier caps requests per MINUTE as well as per day, and answers 429 once you
 * cross it. Spacing every live call keeps a capture run inside that ceiling — slow, but a
 * capture that has to be restarted costs quota, and quota is the scarce thing here.
 */
const recorder = new RecordingAdapter(
  new ApiFootballAdapter({
    apiKey: key,
    onRequest: async (endpoint) => {
      if (spent > 0) await sleep(Number(process.env.REQUEST_SPACING_MS ?? 7000));
      spent += 1;
      console.log(`  → [${spent}] ${endpoint}`);
    },
  }),
  store,
);

const replayer = new ReplayAdapter(store);

/**
 * Replays a cassette we already hold, and only reaches the network for a genuine miss.
 *
 * Without this, "skipping those" meant loading the file and then buying it again — which
 * is what the first version did, and it spent five requests proving it.
 */
const via = (request: ProviderRequest): ProviderAdapter =>
  store.get(cassetteName(request)) ? replayer : recorder;

const season: SeasonRef = { leagueProviderId: LEAGUE, seasonYear: SEASON };

/** Loads what is already on disk so a re-run does not re-buy it. */
function preload(): void {
  mkdirSync(CASSETTE_DIR, { recursive: true });
  if (FORCE) return;

  for (const name of cassetteFiles()) {
    store.put(name, JSON.parse(readFileSync(join(CASSETTE_DIR, `${name}.json`), 'utf8')) as Cassette);
  }
}

function cassetteFiles(): string[] {
  // Only the files this script writes; chosen-fixture.json is an index, not a cassette.
  return readdirSync(CASSETTE_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'chosen-fixture.json' && f !== 'edge-cases.json')
    .map((f) => f.replace(/\.json$/, ''));
}

function flush(): void {
  for (const name of store.names()) {
    writeFileSync(join(CASSETTE_DIR, `${name}.json`), JSON.stringify(store.get(name), null, 2));
  }
}

async function checkQuota(): Promise<number> {
  const response = await fetch('https://v3.football.api-sports.io/status', {
    headers: { 'x-apisports-key': key! },
  });
  const body = (await response.json()) as {
    response?: { requests?: { current: number; limit_day: number }; subscription?: { plan: string } };
  };
  const requests = body.response?.requests;
  if (!requests) throw new Error('Could not read account status.');

  const left = requests.limit_day - requests.current;
  console.log(
    `Plan ${body.response?.subscription?.plan}: ${requests.current}/${requests.limit_day} used, ${left} left today.\n`,
  );
  return left;
}

async function main() {
  const left = await checkQuota();
  preload();
  const already = store.names().length;
  if (already > 0) console.log(`${already} cassettes already on disk — skipping those.\n`);

  console.log(`Season ${SEASON} (league ${LEAGUE}):`);
  const teams = await via(requests.teams(season)).listTeams(season);
  const fixtures = await via(requests.fixtures(season)).listFixtures(season);
  console.log(`    ${teams.data.length} teams, ${fixtures.data.length} fixtures`);

  // One squad only. Twenty would be a fifth of the daily budget for twenty copies of the
  // same shape; the bootstrap loops over all of them at run time, which is a different
  // question from whether the shape parses.
  const firstTeam = teams.data[0];
  if (firstTeam) {
    const squadRequest = requests.squad(season, firstTeam.providerId);
    const squad = await via(squadRequest).listSquad(season, firstTeam.providerId);
    console.log(`    squad of ${firstTeam.name}: ${squad.data.length} players`);
  }

  await via(requests.standings(season)).listStandings(season);
  await via(requests.topScorers(season)).listTopScorers(season);

  // Live is almost always empty off-matchday. Recorded regardless: the empty-live shape is
  // what the live sync sees 95% of the time, and it must not be mistaken for an error.
  await via(requests.liveFixtures(season)).listLiveFixtures(season).catch((e) => console.log(`    live: ${e.message}`));

  flush();

  // --- event edge cases ----------------------------------------------------
  //
  // The scoreline cassette above is all "Normal Goal". Penalties and own goals are
  // different *detail* strings, and they are what EVENT_TYPE_MAP disambiguates — an own
  // goal counts for the opposing team and can never satisfy a first-scorer pick, so
  // misreading one pays out the wrong people. Those branches were written against
  // documentation; this finds real examples to pin them to.
  const finished = fixtures.data
    .filter((f) => f.status === 'finished')
    .sort(
      (a, b) => (b.homeScore ?? 0) + (b.awayScore ?? 0) - ((a.homeScore ?? 0) + (a.awayScore ?? 0)),
    );

  const found: Record<string, string> = {};
  const wanted = ['penalty_goal', 'own_goal', 'red', 'missed_penalty'];
  let hunted = 0;

  for (const fixture of finished) {
    if (wanted.every((w) => found[w])) break;
    if (hunted >= HUNT_BUDGET || spent >= left - 2) break;

    const eventsRequest = requests.events(fixture.providerId);
    const wasCached = store.get(cassetteName(eventsRequest)) != null;
    const events = await via(eventsRequest).listEvents(fixture.providerId);
    if (!wasCached) hunted += 1;

    const types = new Set(events.data.map((e) => e.type));
    const newlyFound = wanted.filter((w) => !found[w] && types.has(w as never));

    if (newlyFound.length > 0) {
      for (const type of newlyFound) found[type] = fixture.providerId;
      // Keep the fixture record too, so a test can assert against its scoreline.
      await via(requests.fixture(fixture.providerId)).getFixture(fixture.providerId);
      console.log(`    ${fixture.providerId}: found ${newlyFound.join(', ')}`);
      flush();
    }
  }

  writeFileSync(
    join(CASSETTE_DIR, 'edge-cases.json'),
    JSON.stringify(
      {
        season: SEASON,
        note: 'Fixture provider ids whose event streams contain each shape. Used by tests.',
        highScoring: finished[0]?.providerId ?? null,
        found,
      },
      null,
      2,
    ),
  );

  flush();
  console.log(`\n${store.names().length} cassettes in packages/provider/cassettes/`);
  console.log(`Spent ${spent} requests this run.`);
  for (const w of wanted) {
    console.log(`  ${found[w] ? '✓' : '·'} ${w}${found[w] ? ` → fixture ${found[w]}` : ' not found'}`);
  }
}

main().catch((error) => {
  flush();
  console.error('\nCapture failed:', error instanceof Error ? error.message : error);
  console.error(`Spent ${spent} requests before failing.`);
  process.exit(1);
});
