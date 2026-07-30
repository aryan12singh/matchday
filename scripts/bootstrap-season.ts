/**
 * Bootstrap the real Premier League season (T9).
 *
 *   pnpm season:bootstrap                 # against the local stack
 *   TARGET=hosted pnpm season:bootstrap   # against the hosted project, with confirmation
 *
 * Loads competition, season, matchweeks, clubs, squads and all 380 fixtures from the
 * Premier League's own JSON, then creates the markets that hang off them.
 *
 * Idempotent by construction (invariant 5): every write is a resolve-or-create through
 * provider_entity_map or a natural-key upsert, so running it twice changes nothing. That
 * matters because the first hosted run happens days before launch, and "run it again" has
 * to be a safe answer rather than a gamble.
 */
import { createClient } from '@supabase/supabase-js';
import { FplAdapter } from '@matchday/provider';
import { bootstrapSeason } from '@matchday/jobs';

import type { Database } from '../packages/domain/src/index';

const SEASON_LABEL = process.env.SEASON_LABEL ?? '2026/27';
const target = process.env.TARGET ?? 'local';

const url =
  target === 'hosted'
    ? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    : 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const isLocal = /(127\.0\.0\.1|localhost)/.test(url);
if (target === 'hosted' && isLocal) {
  console.error('TARGET=hosted but the URL points at localhost.');
  process.exit(1);
}
if (target !== 'hosted' && !isLocal) {
  console.error(`Refusing to write to ${url} without TARGET=hosted.`);
  process.exit(1);
}

const client = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`\nBootstrapping ${SEASON_LABEL} into ${isLocal ? 'the local stack' : url}\n`);

  const adapter = new FplAdapter({
    onRequest: (endpoint) => console.log(`  → fpl${endpoint}`),
  });

  const started = Date.now();
  const result = await bootstrapSeason(client, adapter, {
    competitionCode: 'pl',
    competitionName: 'Premier League',
    seasonLabel: SEASON_LABEL,
    // Free here, unlike API-Football: every squad comes out of the one bootstrap-static
    // response the adapter already caches, so this costs no extra requests at all.
    seasonRef: { leagueProviderId: 'pl', seasonYear: Number(SEASON_LABEL.slice(0, 4)) },
    includeSquads: true,
  });

  if (!result) {
    console.error('Another bootstrap holds the lock — nothing done.');
    process.exit(1);
  }

  console.log(`
  teams      ${result.teams}
  rounds     ${result.rounds}
  fixtures   ${result.fixtures}
  markets    ${result.markets}
  took       ${Math.round((Date.now() - started) / 1000)}s
`);

  // Sanity checks worth failing loudly on: a short season is the kind of thing nobody
  // notices until a matchweek has fewer fixtures than it should.
  const problems: string[] = [];
  if (result.teams !== 20) problems.push(`expected 20 teams, got ${result.teams}`);
  if (result.rounds !== 38) problems.push(`expected 38 matchweeks, got ${result.rounds}`);
  if (result.fixtures !== 380) problems.push(`expected 380 fixtures, got ${result.fixtures}`);

  const { count: players } = await client
    .from('squad_memberships')
    .select('player_id', { count: 'exact', head: true })
    .eq('season_id', result.seasonId);
  console.log(`  squad memberships: ${players}`);
  if ((players ?? 0) < 400) problems.push(`only ${players} squad memberships`);

  const { data: unlocked } = await client
    .from('markets')
    .select('id')
    .is('locks_at', null)
    .limit(1);
  if ((unlocked ?? []).length > 0) {
    problems.push('a market has no locks_at — the lock trigger cannot enforce a null deadline');
  }

  if (problems.length > 0) {
    console.error('Problems:\n' + problems.map((p) => `  ✗ ${p}`).join('\n'));
    process.exit(1);
  }

  console.log('  ✓ 20 clubs, 38 matchweeks, 380 fixtures, every market has a deadline\n');
}

main().catch((error) => {
  console.error('\nBootstrap failed:', error);
  process.exit(1);
});
