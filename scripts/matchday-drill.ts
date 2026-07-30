/**
 * Matchday drill — the full spine, end to end, against a real database.
 *
 * This is the "simulated matchweek e2e green" exit condition from
 * docs/plan/launch-calendar.md, and the preseason drill the freeze week calls for. It
 * runs the sequence that actually matters on 21 August:
 *
 *   two users predict -> kickoff locks the markets -> a result and its events arrive ->
 *   settlement writes hits -> the leaderboard values them -> a provider correction
 *   rewrites the result -> the rerun produces a diff, not a silent edit
 *
 * Predictions are written through real signed-in sessions, not the service role. That is
 * the point: the service role bypasses the kickoff lock by design, so a drill that used
 * it would prove nothing about the control it is meant to exercise.
 *
 * Exits non-zero on the first failure, so it can gate a deploy.
 *
 *   pnpm drill
 */
import { type Database, DEFAULT_WEIGHTS } from '@matchday/domain';
import { settleLeaguePrizes, settleFixtureMarkets } from '@matchday/jobs';
import { aggregateLeaderboard, toComponentRows } from '@matchday/scoring';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!serviceKey || !anonKey) {
  console.error('Needs SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  console.error('  export SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY)');
  console.error('  export NEXT_PUBLIC_SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY)');
  process.exit(1);
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
  console.error(`Refusing to drill against a non-local database: ${url}`);
  process.exit(1);
}

const db = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'drill-password-123';
let checks = 0;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    console.error(`\n  ✗ ${message}\n`);
    process.exit(1);
  }
  checks += 1;
}

const heading = (text: string) => console.log(`\n${text}`);
const pass = (text: string) => console.log(`  ✓ ${text}`);

async function main() {
  heading('Setup');

  const { data: season } = await db
    .from('seasons')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  assert(season != null, 'No current season. Run `pnpm db:seed:dev` first.');

  const { data: fixture } = await db
    .from('fixtures')
    .select('id, home_team_id, round_id')
    .eq('status', 'scheduled')
    .order('kickoff_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  assert(fixture != null, 'No scheduled fixture. Run `pnpm db:seed:dev` first.');

  const fixtureId = fixture.id;

  const alice = await ensureUser('drill-alice@example.test');
  const bob = await ensureUser('drill-bob@example.test');
  const league = await ensureLeague(alice, bob, season.id);

  // A drill that only passes on a virgin database is not a drill. Reset whatever a
  // previous run left behind so this is repeatable and its expected point totals mean
  // something.
  await resetDrillState(season.id, [alice, bob], fixtureId);

  pass('season, fixture, two users and a league in place; prior drill state cleared');

  // --- predict, as the users themselves ---------------------------------------
  heading('Predictions');

  const aliceClient = await signIn('drill-alice@example.test');
  const bobClient = await signIn('drill-bob@example.test');

  await predict(aliceClient, fixtureId, 2, 1); // exactly right, as it turns out
  await predict(bobClient, fixtureId, 3, 0); // right outcome, and 3 total goals by luck

  // Scoped to this fixture, not to the users: the drill is re-runnable, and a previous
  // run's settled fixture leaves predictions behind by design.
  const { count: predictionCount } = await db
    .from('predictions')
    .select('id, markets!inner ( fixture_id )', { count: 'exact', head: true })
    .in('user_id', [alice, bob])
    .eq('markets.fixture_id', fixtureId);

  assert(
    predictionCount === 12,
    `expected 12 prediction rows (2 users x 6 markets), got ${predictionCount}`,
  );
  pass('both users predicted across all six fixture markets');

  // --- kickoff -----------------------------------------------------------------
  heading('Kickoff');

  const past = new Date(Date.now() - 60_000).toISOString();
  await db.from('fixtures').update({ kickoff_at: past }).eq('id', fixtureId);
  await db.from('markets').update({ locks_at: past }).eq('fixture_id', fixtureId);

  const { data: lockedCount } = await db.rpc('lock_markets_sweep');
  assert((lockedCount ?? 0) >= 6, `sweep locked ${lockedCount} markets, expected at least 6`);

  // The control the entire product rests on.
  const lateWrite = await predict(aliceClient, fixtureId, 9, 9).then(
    () => null,
    (error: Error) => error,
  );
  assert(lateWrite != null, 'a prediction written after kickoff was NOT rejected');
  pass('markets locked; a post-kickoff write is rejected by the database');

  // --- full time ----------------------------------------------------------------
  heading('Full time');

  await recordResult(fixtureId, 2, 1, fixture.home_team_id);

  const settled = await settleFixtureMarkets(db, fixtureId, 'auto_result');
  assert(settled != null, 'settlement returned null — the advisory lock was already held');
  assert(
    settled.componentsWritten === 16,
    `expected 16 components (2 users x 8 categories), got ${settled.componentsWritten}`,
  );
  assert(settled.componentsChanged === 0, 'a first settlement should produce no diff rows');
  pass(`settled ${settled.marketsSettled} markets, ${settled.componentsWritten} components, 0 changes`);

  // --- leaderboard ---------------------------------------------------------------
  heading('Leaderboard');

  const board = await buildBoard(league.leagueSeasonId, [alice, bob], fixture.round_id);
  const aliceRow = board.find((r) => r.userId === alice)!;
  const bobRow = board.find((r) => r.userId === bob)!;

  // outcome 3 + exact 3 + goal_diff 2 + total_goals 1 + btts 1 = 10.
  assert(aliceRow.points === 10, `expected alice on 10 points, got ${aliceRow.points}`);
  // bob predicted 3-0 against an actual 2-1: outcome 3, plus total goals 1 because both
  // add to three. That coincidence is the point — it exercises the derived hedge path,
  // where an untouched total_goals is scored from the scoreline rather than ignored.
  assert(bobRow.points === 4, `expected bob on 4 points, got ${bobRow.points}`);
  assert(board[0]!.userId === alice, 'alice should be top of the board');
  pass(`alice ${aliceRow.points}, bob ${bobRow.points} — values, derived hedges and ordering correct`);

  // --- correction ------------------------------------------------------------------
  heading('Provider correction');

  // VAR chalks one off: 2-1 becomes 1-1. alice loses exact and goal difference; bob
  // loses his outcome entirely.
  await recordResult(fixtureId, 1, 1, fixture.home_team_id);

  const rerun = await settleFixtureMarkets(db, fixtureId, 'correction');
  assert(rerun != null, 'the correction rerun returned null');
  assert(
    rerun.componentsChanged > 0,
    'a correction that changed the result produced NO diff rows — the audit trail is broken',
  );

  const { count: diffCount } = await db
    .from('score_run_changes')
    .select('score_run_id', { count: 'exact', head: true })
    .eq('score_run_id', rerun.scoreRunId);
  assert(
    (diffCount ?? 0) === rerun.componentsChanged,
    `settlement reported ${rerun.componentsChanged} changes but persisted ${diffCount}`,
  );
  pass(`rerun wrote ${rerun.componentsChanged} diff rows — the change is audited, not silent`);

  const corrected = await buildBoard(league.leagueSeasonId, [alice, bob], fixture.round_id);
  const aliceAfter = corrected.find((r) => r.userId === alice)!;
  const bobAfter = corrected.find((r) => r.userId === bob)!;

  assert(
    aliceAfter.points !== aliceRow.points || bobAfter.points !== bobRow.points,
    'the leaderboard did not change after a correction',
  );
  assert(bobAfter.points === 0, `bob called a home win that was corrected to a draw; expected 0, got ${bobAfter.points}`);
  pass(`board revalued automatically: alice ${aliceAfter.points}, bob ${bobAfter.points}`);

  // --- rerun safety -------------------------------------------------------------------
  heading('Rerun safety');

  const again = await settleFixtureMarkets(db, fixtureId, 'manual');
  assert(again != null, 'the idempotent rerun returned null');
  assert(
    again.componentsChanged === 0,
    `re-running over unchanged inputs produced ${again.componentsChanged} diffs, expected 0`,
  );
  pass('re-running over unchanged inputs is a no-op — invariant 5 holds');

  // --- prizes -------------------------------------------------------------------------
  //
  // The scheme has been configurable for a while and nothing ever wrote a settlement row,
  // so a league could switch prizes on and never get a number out of it. This proves a
  // real board becomes a real ledger, and that a correction revises rather than rewrites.
  heading('Prize ledger');

  // Written directly rather than through upsert_prize_scheme: that RPC is organizer-gated
  // on auth.uid(), which is null for the service role this drill runs as. The gate is
  // covered by pgTAP; what is under test here is the engine.
  const { data: scheme, error: schemeError } = await db
    .from('prize_schemes')
    .insert({
      league_season_id: league.leagueSeasonId,
      kind: 'zero_sum_rank_table',
      currency_label: '£',
      definition: { overall: [10, -10], per_round: [5, -5] },
      activated_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  assert(!schemeError, `could not create the prize scheme: ${schemeError?.message}`);

  const { error: attachError } = await db
    .from('league_seasons')
    .update({ prize_scheme_id: scheme!.id })
    .eq('id', league.leagueSeasonId);
  assert(!attachError, `could not attach the prize scheme: ${attachError?.message}`);

  const prizes = await settleLeaguePrizes(db, league.leagueSeasonId);
  assert(prizes != null && prizes.skipped == null, `prize settlement skipped: ${prizes?.skipped}`);
  assert(prizes!.written === 2, `expected 2 ledger rows, got ${prizes!.written}`);

  const { data: ledger } = await db
    .from('prize_settlements')
    .select('user_id, amount, revised_from')
    .eq('league_season_id', league.leagueSeasonId)
    .is('period_round_id', null);

  const sum = (ledger ?? []).reduce((total, row) => total + Number(row.amount), 0);
  assert(Math.abs(sum) < 0.005, `the ledger does not net to zero (got ${sum})`);
  pass(`ledger written: ${(ledger ?? []).map((r) => Number(r.amount)).sort((a, b) => b - a).join(', ')} — nets to zero`);

  const rerunPrizes = await settleLeaguePrizes(db, league.leagueSeasonId);
  assert(
    rerunPrizes!.written === 0 && rerunPrizes!.revised === 0,
    `re-running the ledger wrote ${rerunPrizes!.written} and revised ${rerunPrizes!.revised}, expected none`,
  );
  pass('re-running the ledger changes nothing — it does not grow on every tick');

  console.log(`\n${checks} checks passed. The spine works end to end.\n`);
}

// ---------------------------------------------------------------------------

/**
 * Returns the season to the state the seed left it in, and clears these users' history.
 *
 * Deletes go through the service role deliberately: predictions have no client delete
 * policy and are protected by reject_prediction_delete, which exempts backend callers
 * precisely so cleanup like this is possible without weakening the rule for users.
 */
async function resetDrillState(seasonId: string, userIds: string[], fixtureId: string) {
  // Walked explicitly rather than as one nested filter: a two-level PostgREST embed
  // filter silently matched nothing here, so the reset ran and cleared nothing.
  const { data: stages } = await db.from('stages').select('id').eq('season_id', seasonId);
  const { data: rounds } = await db
    .from('rounds')
    .select('id')
    .in('stage_id', (stages ?? []).map((r) => r.id));
  const { data: fixtures } = await db
    .from('fixtures')
    .select('id')
    .in('round_id', (rounds ?? []).map((r) => r.id));

  const fixtureIds = (fixtures ?? []).map((f) => f.id);
  if (fixtureIds.length === 0) return;

  const { data: markets } = await db
    .from('markets')
    .select('id')
    .in('fixture_id', fixtureIds);
  const marketIds = (markets ?? []).map((m) => m.id);

  if (marketIds.length > 0) {
    await db.from('score_components').delete().in('market_id', marketIds).in('user_id', userIds);
    await db.from('predictions').delete().in('market_id', marketIds).in('user_id', userIds);
  }

  await db.from('fixture_events').delete().in('fixture_id', fixtureIds);
  await db
    .from('fixtures')
    .update({ status: 'scheduled', home_score: null, away_score: null, result_confirmed_at: null })
    .in('id', fixtureIds);

  // Only the fixture under test needs an open market; the rest can keep their seeded
  // kickoffs, which are already in the future.
  const future = new Date(Date.now() + 3600_000).toISOString();
  await db.from('fixtures').update({ kickoff_at: future }).eq('id', fixtureId);
  await db
    .from('markets')
    .update({ status: 'open', locks_at: future, outcome: null, settled_at: null })
    .eq('fixture_id', fixtureId);
}

async function ensureUser(email: string): Promise<string> {
  const { data } = await db.auth.admin.listUsers();
  const found = data.users.find((u) => u.email === email);
  if (found) return found.id;

  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return created.user!.id;
}

/** A client carrying that user's session, so RLS and the lock trigger both apply. */
async function signIn(email: string) {
  const client = createClient<Database>(url, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`could not sign in ${email}: ${error.message}`);
  return client;
}

async function predict(
  client: ReturnType<typeof createClient<Database>>,
  fixtureId: string,
  home: number,
  away: number,
) {
  const { error } = await client.rpc('save_fixture_prediction', {
    p_fixture_id: fixtureId,
    p_home: home,
    p_away: away,
  });
  if (error) throw new Error(error.message);
}

async function recordResult(
  fixtureId: string,
  home: number,
  away: number,
  firstScoringTeamId: string,
) {
  await db
    .from('fixtures')
    .update({
      status: 'finished',
      home_score: home,
      away_score: away,
      result_confirmed_at: new Date().toISOString(),
    })
    .eq('id', fixtureId);

  // A correction restates the match, so the event stream is replaced rather than appended.
  await db.from('fixture_events').delete().eq('fixture_id', fixtureId);

  if (home + away > 0) {
    await db.from('fixture_events').insert({
      fixture_id: fixtureId,
      minute: 12,
      type: 'goal',
      team_id: firstScoringTeamId,
      provider_event_key: `${fixtureId}:12:first`,
    });
  }
}

async function buildBoard(leagueSeasonId: string, userIds: string[], roundId: string) {
  const { data: components } = await db.rpc('league_score_components', {
    p_league_season_id: leagueSeasonId,
    p_round_id: roundId,
  });

  const { data: profiles } = await db.from('profiles').select('id, username').in('id', userIds);

  return aggregateLeaderboard({
    components: toComponentRows(components ?? []),
    members: (profiles ?? []).map((p) => ({
      userId: p.id,
      username: p.username,
      joinedAt: '2026-07-01T00:00:00Z',
    })),
    weights: DEFAULT_WEIGHTS,
  });
}

async function ensureLeague(organizer: string, member: string, seasonId: string) {
  const { data: existing } = await db
    .from('leagues')
    .select('id')
    .eq('join_code', 'DRILLCODE1')
    .maybeSingle();

  const leagueId =
    existing?.id ??
    (
      await db
        .from('leagues')
        .insert({ name: 'Drill League', join_code: 'DRILLCODE1', created_by: organizer })
        .select('id')
        .single()
    ).data!.id;

  await db.from('league_members').upsert(
    [
      { league_id: leagueId, user_id: organizer, role: 'organizer' },
      { league_id: leagueId, user_id: member, role: 'member' },
    ],
    { onConflict: 'league_id,user_id' },
  );

  const { data: leagueSeason } = await db
    .from('league_seasons')
    .upsert({ league_id: leagueId, season_id: seasonId }, { onConflict: 'league_id,season_id' })
    .select('id')
    .single();

  const { data: version } = await db
    .from('rule_set_versions')
    .select('id')
    .order('version', { ascending: false })
    .limit(1)
    .single();

  await db.from('league_rule_bindings').upsert(
    {
      league_season_id: leagueSeason!.id,
      rule_set_version_id: version!.id,
      effective_from_round: 1,
    },
    { onConflict: 'league_season_id,effective_from_round' },
  );

  return { leagueId, leagueSeasonId: leagueSeason!.id };
}

main().catch((error) => {
  console.error('\n  ✗', error instanceof Error ? (error.stack ?? error.message) : error, '\n');
  process.exit(1);
});
