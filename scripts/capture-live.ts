/**
 * Capture live provider payloads — the shapes that only exist while a match is playing.
 *
 *   API_FOOTBALL_KEY=... pnpm cassettes:live
 *
 * Everything in packages/provider/cassettes/ was recorded from a completed season, so it
 * shows finished fixtures and closed event streams. None of it contains an `elapsed`
 * minute, a `1H`/`HT`/`2H` status, or a goal that arrived while we were watching — which
 * is the half of the feed the live sync actually consumes.
 *
 * That gap looked unclosable on the Free plan, because every season it can reach is over.
 * It is not: `/fixtures?live=all` is not season-scoped and answers for any competition
 * currently playing. Response shapes belong to the API version rather than the league, so
 * a Finnish second-division match at 21:00 verifies the same parser the Premier League
 * will exercise on 21 August.
 *
 * Two samples are taken a minute apart so the cassettes capture *progression* — a minute
 * advancing, and with luck a goal appearing — rather than a single frozen instant. A live
 * sync that cannot tell those apart is a live sync that never updates anything.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const B = 'https://v3.football.api-sports.io';
const DIR = join(process.cwd(), 'packages/provider/cassettes/live');

const key = process.env.API_FOOTBALL_KEY;
if (!key) {
  console.error('API_FOOTBALL_KEY is not set.');
  process.exit(1);
}

/** Seconds between the two samples. Long enough for the clock to move. */
const GAP_SECONDS = Number(process.env.LIVE_GAP_SECONDS ?? 90);
/** How many in-play fixtures to follow. Each costs one request per sample. */
const FOLLOW = Number(process.env.LIVE_FOLLOW ?? 3);

let spent = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(path: string): Promise<unknown> {
  // The Free tier limits per minute as well as per day.
  if (spent > 0) await sleep(Number(process.env.REQUEST_SPACING_MS ?? 7000));
  spent += 1;
  const response = await fetch(`${B}${path}`, { headers: { 'x-apisports-key': key! } });
  const body = (await response.json()) as { errors?: unknown };
  const errors = body.errors;
  if (errors && typeof errors === 'object' && Object.keys(errors).length > 0) {
    throw new Error(`${path}: ${JSON.stringify(errors)}`);
  }
  console.log(`  → [${spent}] ${path}`);
  return body;
}

interface LiveFixture {
  fixture: { id: number; status: { short: string; elapsed: number | null } };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
  league: { name: string };
}

function write(name: string, endpoint: string, raw: unknown): void {
  writeFileSync(
    join(DIR, `${name}.json`),
    JSON.stringify({ endpoint, httpStatus: 200, raw, recordedAt: new Date().toISOString() }, null, 2),
  );
}

async function sample(label: string, ids: number[]): Promise<LiveFixture[]> {
  const list = (await get('/fixtures?live=all')) as { response: LiveFixture[] };
  write(`live-list.${label}`, '/fixtures', list);

  const following = ids.length
    ? list.response.filter((f) => ids.includes(f.fixture.id))
    : list.response
        .slice()
        .sort(
          (a, b) =>
            (b.goals.home ?? 0) + (b.goals.away ?? 0) - ((a.goals.home ?? 0) + (a.goals.away ?? 0)),
        )
        .slice(0, FOLLOW);

  for (const fixture of following) {
    const events = await get(`/fixtures/events?fixture=${fixture.fixture.id}`);
    write(`events.${fixture.fixture.id}.${label}`, '/fixtures/events', events);
  }

  for (const f of following) {
    console.log(
      `     ${f.league.name}: ${f.teams.home.name} ${f.goals.home}-${f.goals.away} ${f.teams.away.name}` +
        ` [${f.fixture.status.short} ${f.fixture.status.elapsed}']`,
    );
  }

  return following;
}

async function main() {
  mkdirSync(DIR, { recursive: true });

  console.log(`Sample 1:`);
  const followed = await sample('t0', []);
  if (followed.length === 0) {
    console.error('\nNothing is live right now. Try again during European evening fixtures.');
    process.exit(1);
  }

  const ids = followed.map((f) => f.fixture.id);
  console.log(`\nWaiting ${GAP_SECONDS}s for the clock to move…`);
  await sleep(GAP_SECONDS * 1000);

  console.log(`Sample 2:`);
  const second = await sample('t1', ids);

  const moved = second.filter((f) => {
    const before = followed.find((x) => x.fixture.id === f.fixture.id);
    return before && f.fixture.status.elapsed !== before.fixture.status.elapsed;
  });

  writeFileSync(
    join(DIR, 'index.json'),
    JSON.stringify(
      {
        note: 'Live payloads captured across two samples. Competition-independent shapes.',
        capturedAt: new Date().toISOString(),
        gapSeconds: GAP_SECONDS,
        fixtures: followed.map((f) => ({
          id: f.fixture.id,
          league: f.league.name,
          label: `${f.teams.home.name} v ${f.teams.away.name}`,
        })),
      },
      null,
      2,
    ),
  );

  console.log(`\nSpent ${spent} requests. ${moved.length}/${second.length} fixtures advanced their clock.`);
}

main().catch((error) => {
  console.error('\nLive capture failed:', error instanceof Error ? error.message : error);
  console.error(`Spent ${spent} requests.`);
  process.exit(1);
});
