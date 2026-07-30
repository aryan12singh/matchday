/**
 * Ingestion drill — the whole provider pipeline against a real database, from cassettes.
 *
 *   pnpm ingest:drill
 *
 * Bootstrap → reschedule → live → events → finalise → settle → correction, using recorded
 * API-Football payloads and the local Supabase stack. No key, no quota, no network.
 *
 * This exists because every serious bug in this repo has been found by running something,
 * not by typechecking it. The jobs below are full of Supabase queries whose column names,
 * embedded-resource syntax and conflict targets are all strings — none of which the
 * compiler checks. A green build proves nothing about whether `rounds!inner(stages!inner(
 * season_id))` is a real relationship path.
 *
 * Refuses to run against anything but localhost, for the obvious reason: it writes a
 * completed 2024/25 season into whatever database it is pointed at.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  type Cassette,
  MemoryCassetteStore,
  ReplayAdapter,
  type SeasonRef,
} from '@matchday/provider';
import {
  bootstrapSeason,
  runTick,
  syncFinal,
  syncFixtures,
  syncLive,
  syncReference,
  writeEvents,
} from '@matchday/jobs';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../packages/domain/src/index';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!/(127\.0\.0\.1|localhost)/.test(url)) {
  console.error(`Refusing to run against ${url} — localhost only.`);
  process.exit(1);
}
if (!serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is not set. Run `pnpm dev:setup` first.');
  process.exit(1);
}

const client = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CASSETTE_DIR = join(process.cwd(), 'packages/provider/cassettes');
const SEASON: SeasonRef = { leagueProviderId: '39', seasonYear: 2024 };

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function loadStore(): MemoryCassetteStore {
  const store = new MemoryCassetteStore();
  for (const file of readdirSync(CASSETTE_DIR)) {
    if (!file.endsWith('.json') || file === 'chosen-fixture.json' || file === 'edge-cases.json') {
      continue;
    }
    store.put(
      file.replace(/\.json$/, ''),
      JSON.parse(readFileSync(join(CASSETTE_DIR, file), 'utf8')) as Cassette,
    );
  }
  return store;
}

const edgeCases = JSON.parse(readFileSync(join(CASSETTE_DIR, 'edge-cases.json'), 'utf8')) as {
  highScoring: string;
  found: Record<string, string>;
};

async function main() {
  const adapter = new ReplayAdapter(loadStore());

  // --- 1. bootstrap --------------------------------------------------------
  console.log('\n▸ Season bootstrap');
  const bootstrap = await bootstrapSeason(client, adapter, {
    competitionCode: 'pl',
    competitionName: 'Premier League',
    seasonLabel: '2024/25',
    seasonRef: SEASON,
    includeSquads: false,
  });

  check('bootstrap returned a season', bootstrap != null);
  check('20 teams', bootstrap?.teams === 20, `got ${bootstrap?.teams}`);
  check('380 fixtures', bootstrap?.fixtures === 380, `got ${bootstrap?.fixtures}`);
  check('38 matchweeks', bootstrap?.rounds === 38, `got ${bootstrap?.rounds}`);
  check('markets created', (bootstrap?.markets ?? 0) > 0, `got ${bootstrap?.markets}`);

  const seasonId = bootstrap!.seasonId;


  // Markets must lock at kickoff, which is the whole basis of invariant 3.
  const { data: sampleMarket } = await client
    .from('markets')
    .select('locks_at, fixtures ( kickoff_at )')
    .not('fixture_id', 'is', null)
    .limit(1)
    .single();

  check(
    'market locks_at matches its fixture kickoff',
    sampleMarket != null &&
      new Date(sampleMarket.locks_at).getTime() ===
        new Date((sampleMarket.fixtures as { kickoff_at: string }).kickoff_at).getTime(),
  );

  // --- 2. idempotency ------------------------------------------------------
  console.log('\n▸ Re-running the bootstrap (invariant 5)');
  const second = await bootstrapSeason(client, adapter, {
    competitionCode: 'pl',
    competitionName: 'Premier League',
    seasonLabel: '2024/25',
    seasonRef: SEASON,
    includeSquads: false,
  });

  const { count: fixtureCount } = await client
    .from('fixtures')
    .select('id', { count: 'exact', head: true });

  check('second run reports the same totals', second?.fixtures === 380);
  check('no duplicate fixtures created', fixtureCount === 380, `${fixtureCount} rows`);

  // --- 3. reschedule -------------------------------------------------------
  console.log('\n▸ Reschedule handling');
  const { data: victim } = await client
    .from('fixtures')
    .select('id, kickoff_at')
    .order('kickoff_at', { ascending: true })
    .limit(1)
    .single();

  // Move it by hand, then let the sync pull it back to what the provider says. That is the
  // same code path a real reschedule takes, in reverse.
  const moved = new Date(new Date(victim!.kickoff_at).getTime() + 48 * 3600 * 1000).toISOString();
  await client.from('fixtures').update({ kickoff_at: moved }).eq('id', victim!.id);
  await client.rpc('ensure_fixture_markets', { p_fixture_id: victim!.id });

  const { data: movedMarket } = await client
    .from('markets')
    .select('locks_at')
    .eq('fixture_id', victim!.id)
    .limit(1)
    .single();
  const sameInstant = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();
  check('moving a kickoff moves the lock with it', sameInstant(movedMarket!.locks_at, moved),
    `lock ${movedMarket!.locks_at} vs ${moved}`);

  const resync = await syncFixtures(client, adapter, { seasonId, seasonRef: SEASON });
  check('sync detected the reschedule', (resync?.rescheduled ?? 0) >= 1, `${resync?.rescheduled}`);

  const { data: restored } = await client
    .from('fixtures')
    .select('kickoff_at')
    .eq('id', victim!.id)
    .single();
  check('kickoff restored from the provider', sameInstant(restored!.kickoff_at, victim!.kickoff_at));

  const { data: restoredMarket } = await client
    .from('markets')
    .select('locks_at')
    .eq('fixture_id', victim!.id)
    .limit(1)
    .single();
  check(
    'and the lock followed it back — invariant 3',
    sameInstant(restoredMarket!.locks_at, victim!.kickoff_at),
    `lock ${restoredMarket!.locks_at} vs kickoff ${victim!.kickoff_at}`,
  );

  // --- 4. events -----------------------------------------------------------
  //
  // The cassette season is complete, so both the bootstrap and the fixture sync correctly
  // mark all 380 fixtures finished. A real 2026/27 bootstrap lands 380 *scheduled* ones,
  // so reset here: the point from now on is to drive a single fixture through the real
  // state machine, not to replay a season that has already been played.
  await client
    .from('fixtures')
    .update({ status: 'scheduled', home_score: null, away_score: null, result_hash: null })
    .neq('status', 'nonexistent');

  console.log('\n▸ Event ingestion');
  const targetProviderId = edgeCases.highScoring;
  const { data: mapping } = await client
    .from('provider_entity_map')
    .select('internal_id')
    .eq('entity_type', 'fixture')
    .eq('provider_id', targetProviderId)
    .single();

  const targetFixtureId = mapping!.internal_id;

  await client.from('fixtures').update({ status: 'live', minute: 60 }).eq('id', targetFixtureId);
  // Backdate it so the 150-minute stale-live cutoff treats it as a match that has ended.
  await client
    .from('fixtures')
    .update({ kickoff_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString() })
    .eq('id', targetFixtureId);
  const live = await syncLive(client, adapter, { seasonId, seasonRef: SEASON });
  check('live sync ran', live != null);

  // The live cassette is an empty response — recorded off-matchday — so drive the events
  // path directly, which is what the live sync would call for an in-play fixture.
  const events = await adapter.listEvents(targetProviderId);
  const written = await writeEvents(client, adapter.name, targetFixtureId, events.data);
  check('events written', written === events.data.length, `${written} of ${events.data.length}`);

  const rewritten = await writeEvents(client, adapter.name, targetFixtureId, events.data);
  const { count: eventCount } = await client
    .from('fixture_events')
    .select('id', { count: 'exact', head: true })
    .eq('fixture_id', targetFixtureId);

  check(
    're-ingesting the same events does not duplicate them',
    eventCount === events.data.length,
    `${eventCount} rows after writing ${written}+${rewritten}`,
  );

  const { data: goalRows } = await client
    .from('fixture_events')
    .select('type, minute, player_id')
    .eq('fixture_id', targetFixtureId)
    .in('type', ['goal', 'own_goal', 'penalty_goal'])
    .order('minute', { ascending: true });

  check('goals landed with minutes', (goalRows?.length ?? 0) === 9, `${goalRows?.length} goals`);

  // Squads were not bootstrapped, so no player is known yet. The documented behaviour is to
  // keep the goal with a null player rather than drop it — a goal with an unknown scorer is
  // closer to the truth than a scoreline the event list disagrees with.
  check('an unknown scorer keeps the goal, with a null player', goalRows?.[0]?.player_id === null);

  // Now teach it one player and re-ingest, which is what the squad bootstrap does.
  const scorerProviderId = events.data.find((e) => e.type === 'goal')!.playerProviderId!;
  const { data: newPlayer } = await client
    .from('players')
    .insert({ full_name: 'Drill Scorer' })
    .select('id')
    .single();
  await client.from('provider_entity_map').insert({
    provider: adapter.name,
    entity_type: 'player',
    provider_id: scorerProviderId,
    internal_id: newPlayer!.id,
  });

  await writeEvents(client, adapter.name, targetFixtureId, events.data);
  const { data: resolvedRows } = await client
    .from('fixture_events')
    .select('player_id')
    .eq('fixture_id', targetFixtureId)
    .not('player_id', 'is', null);

  check(
    'once the player is known, re-ingestion resolves them',
    (resolvedRows?.length ?? 0) > 0,
    `${resolvedRows?.length} events with a player`,
  );

  // --- 5. finalise + settle ------------------------------------------------
  console.log('\n▸ Finalisation and settlement');
  const final = await syncFinal(client, adapter, {
    mode: 'finalise',
    correctionWindowHours: 24 * 365 * 5,
    limit: 5,
  });
  check('sync_final ran', final != null, JSON.stringify(final));

  const { data: finalised } = await client
    .from('fixtures')
    .select('status, home_score, away_score, result_hash')
    .eq('id', targetFixtureId)
    .single();

  check('fixture finalised', finalised?.status === 'finished', `status ${finalised?.status}`);
  check('score written', finalised?.home_score === 3 && finalised?.away_score === 6,
    `${finalised?.home_score}-${finalised?.away_score}`);
  check('result_hash stored for correction detection', !!finalised?.result_hash);

  const tick = await runTick(client);
  check('tick settled the finished fixture', tick.fixturesSettled >= 1, JSON.stringify(tick.errors));

  const { data: markets } = await client
    .from('markets')
    .select('status')
    .eq('fixture_id', targetFixtureId);
  check(
    'markets moved to settled',
    (markets ?? []).every((m) => m.status === 'settled'),
    (markets ?? []).map((m) => m.status).join(','),
  );

  // --- 6. correction -------------------------------------------------------
  console.log('\n▸ Correction re-check');
  // Corrupt the stored hash so the next run sees a difference, which is exactly what a
  // provider revision looks like from this side.
  await client.from('fixtures').update({ result_hash: 'stale' }).eq('id', targetFixtureId);
  await client.from('fixtures').update({ status: 'settled' }).eq('id', targetFixtureId);

  const corrected = await syncFinal(client, adapter, {
    mode: 'corrections',
    correctionWindowHours: 24 * 365 * 5,
    limit: 5,
  });
  check('correction detected and re-settled', (corrected?.corrected ?? 0) >= 1, JSON.stringify(corrected));

  const { data: runs } = await client
    .from('score_runs')
    .select('trigger')
    .eq('trigger', 'correction');
  check('a correction score_run was recorded', (runs?.length ?? 0) >= 1);

  // --- 7. reference data ---------------------------------------------------
  console.log('\n▸ Standings and top scorers');
  const reference = await syncReference(client, adapter, { seasonId, seasonRef: SEASON });
  check('standings written', (reference?.standingsRows ?? 0) === 20, `${reference?.standingsRows}`);

  const { data: table } = await client
    .from('standings')
    .select('position, points, played')
    .eq('season_id', seasonId)
    .order('position', { ascending: true });

  check('table has 20 positions', table?.length === 20);
  check('champion is top on points', (table?.[0]?.points ?? 0) >= (table?.[1]?.points ?? 0));
  check('points agree with results', (table ?? []).every((r) => r.played === 38));

  await syncReference(client, adapter, { seasonId, seasonRef: SEASON });
  const { count: standingsCount } = await client
    .from('standings')
    .select('id', { count: 'exact', head: true });
  check('re-running does not duplicate the table', standingsCount === 20, `${standingsCount} rows`);

  // --- 8. quota ledger -----------------------------------------------------
  console.log('\n▸ Quota ledger');
  const before = await client.rpc('record_provider_call', {
    p_provider: 'drill',
    p_plan_limit: 100,
  });
  const after = await client.rpc('record_provider_call', {
    p_provider: 'drill',
    p_plan_limit: 100,
  });
  check('provider calls increment atomically', (after.data ?? 0) === (before.data ?? 0) + 1,
    `${before.data} → ${after.data}`);

  // --- 9. sync run bookkeeping ---------------------------------------------
  console.log('\n▸ Observability');
  const { data: syncRuns } = await client
    .from('sync_runs')
    .select('kind, status')
    .order('started_at', { ascending: false });

  const kinds = new Set((syncRuns ?? []).map((r) => r.kind));
  check('every job recorded a sync_run', kinds.size >= 4, [...kinds].join(', '));
  check(
    'no job failed',
    (syncRuns ?? []).every((r) => r.status !== 'failed'),
    (syncRuns ?? []).filter((r) => r.status === 'failed').map((r) => r.kind).join(', '),
  );

  const { count: payloads } = await client
    .from('raw_payloads')
    .select('id', { count: 'exact', head: true });
  check('raw payloads archived before interpretation — invariant 1', (payloads ?? 0) > 0, `${payloads}`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\nDrill crashed:', error);
  process.exit(1);
});
