/**
 * Seeds a fake Premier-League-shaped season into the local database.
 *
 * This exists so the whole spine — predict, lock, settle, leaderboard, table race — can be
 * exercised before the provider key arrives, and so the matchday drill in
 * scripts/matchday-drill.ts has something to drill against.
 *
 * It never touches a remote database: it refuses to run against anything but localhost,
 * because a script that invents twenty fake clubs must not be one typo away from
 * production.
 *
 *   pnpm db:seed:dev
 */
import type { Database } from '@matchday/domain';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required. Try:\n');
  console.error('  export SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY)\n');
  process.exit(1);
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
  console.error(`Refusing to seed fake data into a non-local database: ${url}`);
  process.exit(1);
}

const db = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Invented clubs. Real PL names are not used — the fake data should be obviously fake. */
const TEAMS = [
  ['Ashcombe United', 'ASH'], ['Brackenfield', 'BRK'], ['Calderwick City', 'CAL'],
  ['Dunmoor Rovers', 'DUN'], ['Eastvale Athletic', 'EAS'], ['Fenwick Town', 'FEN'],
  ['Greyharbour', 'GRY'], ['Hollowbrook', 'HOL'], ['Ironmere FC', 'IRN'],
  ['Kelsworth', 'KEL'], ['Larkfield Park', 'LAR'], ['Marchmont Wanderers', 'MAR'],
  ['Northgate', 'NOR'], ['Oakhaven', 'OAK'], ['Pendleton Vale', 'PEN'],
  ['Quarrybridge', 'QUA'], ['Redmoss Albion', 'RED'], ['Stonewell', 'STO'],
  ['Thornbury', 'THO'], ['Westmarch', 'WES'],
] as const;

async function main() {
  console.log('Seeding a fake season into', url);

  const { data: competition } = await db
    .from('competitions')
    .upsert({ code: 'dev-league', name: 'Development League', kind: 'league' }, { onConflict: 'code' })
    .select('id')
    .single();

  // First kickoff is deliberately in the future so season markets stay open and the
  // table predictor is enterable — a seed that arrives pre-locked is useless for testing.
  const firstKickoff = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  const { data: season } = await db
    .from('seasons')
    .upsert(
      {
        competition_id: competition!.id,
        label: '2026/27 (dev)',
        status: 'active',
        is_current: true,
        first_kickoff_at: firstKickoff.toISOString(),
      },
      { onConflict: 'competition_id,label' },
    )
    .select('id')
    .single();

  const seasonId = season!.id;

  const { data: stage } = await db
    .from('stages')
    .upsert(
      { season_id: seasonId, name: 'Regular Season', kind: 'round_robin', sequence: 1 },
      { onConflict: 'season_id,sequence' },
    )
    .select('id')
    .single();

  const teamIds: string[] = [];
  for (const [name, code] of TEAMS) {
    const { data: existing } = await db.from('teams').select('id').eq('name', name).maybeSingle();
    const id =
      existing?.id ??
      (await db.from('teams').insert({ name, code, country: 'England' }).select('id').single()).data!
        .id;

    teamIds.push(id);
    await db
      .from('team_season_entries')
      .upsert({ season_id: seasonId, team_id: id }, { onConflict: 'season_id,team_id' });
  }

  // Three matchweeks of ten fixtures: enough to exercise a settled round, a live round and
  // an open one without seeding a whole 380-fixture season.
  let fixtureCount = 0;

  for (let week = 1; week <= 3; week += 1) {
    const { data: round } = await db
      .from('rounds')
      .upsert(
        { stage_id: stage!.id, number: week, name: `Matchweek ${week}` },
        { onConflict: 'stage_id,number' },
      )
      .select('id')
      .single();

    // Rotate the pairings so each week is a different set of fixtures.
    for (let i = 0; i < 10; i += 1) {
      const home = teamIds[(i * 2 + week) % 20]!;
      const away = teamIds[(i * 2 + 1 + week) % 20]!;
      if (home === away) continue;

      const kickoff = new Date(firstKickoff.getTime() + (week - 1) * 7 * 86400000 + i * 3600000);

      const { data: existing } = await db
        .from('fixtures')
        .select('id')
        .eq('round_id', round!.id)
        .eq('home_team_id', home)
        .maybeSingle();

      const fixtureId =
        existing?.id ??
        (
          await db
            .from('fixtures')
            .insert({
              round_id: round!.id,
              home_team_id: home,
              away_team_id: away,
              kickoff_at: kickoff.toISOString(),
              status: 'scheduled',
            })
            .select('id')
            .single()
        ).data!.id;

      await db.rpc('ensure_fixture_markets', { p_fixture_id: fixtureId });
      fixtureCount += 1;
    }
  }

  await db.rpc('ensure_season_markets', { p_season_id: seasonId });

  const { count } = await db
    .from('markets')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', seasonId);

  console.log(`  ${TEAMS.length} teams`);
  console.log(`  ${fixtureCount} fixtures across 3 matchweeks`);
  console.log(`  ${count} markets, first kickoff ${firstKickoff.toISOString()}`);
  console.log('\nSign up, create a league, and predict. Then: pnpm drill');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
