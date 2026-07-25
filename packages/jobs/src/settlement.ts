import type {
  Database,
  FixtureOutcome,
  FixturePrediction,
  Json,
  ScoreComponent,
} from '@matchday/domain';
import { settleFixture, settleVoidFixture } from '@matchday/scoring';
import type { SupabaseClient } from '@supabase/supabase-js';

import { withAdvisoryLock } from './locks';

/** Typed against the generated schema: an untyped client returns embeds as arrays. */
type Db = SupabaseClient<Database>;

type ScoreRunChangeInsert = Database['public']['Tables']['score_run_changes']['Insert'];

/**
 * Settlement engine and score runs — phase 1 of the two-phase model.
 *
 * Settles category *hits* once, globally, league-independent (invariant 4). Leagues never
 * appear in this file: what a hit is worth is decided at aggregation, under whichever
 * rule-set version each league is bound to.
 *
 * Re-runnable and idempotent (invariant 5). A rerun over unchanged inputs writes the same
 * components and produces an empty diff; a rerun after a provider correction writes the
 * new values AND a score_run_changes row per changed component. Corrections never edit
 * silently — the diff log is the audit the old app lacked, and money depends on it.
 */

export interface SettlementResult {
  scoreRunId: string;
  marketsSettled: number;
  componentsWritten: number;
  componentsChanged: number;
}

export type SettlementTrigger = 'auto_result' | 'correction' | 'manual' | 'backfill';

interface StoredComponent {
  user_id: string;
  market_id: string;
  category: string;
  hit: boolean;
  raw: Json;
}

/**
 * Settles every market on one fixture.
 *
 * Returns null when another run already holds the fixture's lock — two concurrent runs
 * would both read "no components", both compute, and both write, leaving a duplicate
 * run and a meaningless diff.
 */
export async function settleFixtureMarkets(
  client: Db,
  fixtureId: string,
  trigger: SettlementTrigger = 'auto_result',
): Promise<SettlementResult | null> {
  return withAdvisoryLock(client, `settle:fixture:${fixtureId}`, async () => {
    const fixture = await loadFixture(client, fixtureId);
    const ruleSetVersionId = await loadDefaultRuleSetVersion(client);

    const { data: run, error: runError } = await client
      .from('score_runs')
      .insert({ trigger, scope: { fixture_id: fixtureId }, status: 'running' })
      .select('id')
      .single();
    if (runError) throw runError;

    try {
      const outcome = buildOutcome(fixture);
      const voided = isVoid(fixture.status);

      // Predictions are global; every user who answered any market on this fixture gets
      // settled, whether or not they are in a league that counts it.
      const predictions = await loadPredictions(client, fixtureId);
      const existing = await loadExistingComponents(client, fixtureId);

      const rows: StoredComponent[] = [];
      const changes: ScoreRunChangeInsert[] = [];

      for (const [userId, prediction] of predictions) {
        const components: ScoreComponent[] = voided
          ? settleVoidFixture()
          : settleFixture(prediction, outcome);

        for (const component of components) {
          const marketId = fixture.marketIdsByCode.get(componentMarket(component.category));
          if (!marketId) continue;

          rows.push({
            user_id: userId,
            market_id: marketId,
            category: component.category,
            hit: component.hit,
            raw: (component.raw ?? null) as Json,
          });

          const key = `${userId}:${marketId}:${component.category}`;
          const before = existing.get(key);
          if (before != null && before.hit !== component.hit) {
            changes.push({
              score_run_id: run.id,
              user_id: userId,
              market_id: marketId,
              category: component.category,
              old_hit: before.hit,
              new_hit: component.hit,
              old_raw: before.raw as Json,
              new_raw: (component.raw ?? null) as Json,
            });
          }
        }
      }

      if (rows.length > 0) {
        // Natural-key upsert: rerunning is a no-op when nothing changed.
        const { error } = await client.from('score_components').upsert(
          rows.map((row) => ({
            ...row,
            rule_set_version_id: ruleSetVersionId,
            score_run_id: run.id,
          })),
          { onConflict: 'user_id,market_id,category' },
        );
        if (error) throw error;
      }

      if (changes.length > 0) {
        const { error } = await client.from('score_run_changes').insert(changes);
        if (error) throw error;
      }

      // Mark the markets settled and stamp the outcome, so the UI can explain each miss.
      const marketIds = [...fixture.marketIdsByCode.values()];
      if (marketIds.length > 0) {
        await client
          .from('markets')
          .update({
            status: voided ? 'void' : 'settled',
            outcome: (voided ? { void: true } : outcome) as unknown as Json,
            settled_at: new Date().toISOString(),
          })
          .in('id', marketIds);
      }

      await client
        .from('fixtures')
        .update({ status: voided ? fixture.status : 'settled' })
        .eq('id', fixtureId);

      await client
        .from('score_runs')
        .update({
          status: 'success',
          finished_at: new Date().toISOString(),
          stats: {
            markets_settled: marketIds.length,
            components_written: rows.length,
            components_changed: changes.length,
          },
        })
        .eq('id', run.id);

      return {
        scoreRunId: run.id,
        marketsSettled: marketIds.length,
        componentsWritten: rows.length,
        componentsChanged: changes.length,
      };
    } catch (error) {
      await client
        .from('score_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        })
        .eq('id', run.id);
      throw error;
    }
  });
}

/** Fixture statuses that void their markets rather than settling them on a result. */
const isVoid = (status: string) =>
  status === 'postponed' || status === 'abandoned' || status === 'cancelled';

/**
 * Which market a category's component hangs off.
 *
 * outcome, exact and team_goals are all derived from the scoreline, so they attach to
 * correct_score. The hedgeable ones attach to their own market, which is what makes them
 * independently re-weightable later.
 */
function componentMarket(category: string): string {
  switch (category) {
    case 'outcome':
    case 'exact':
    case 'team_goals':
      return 'correct_score';
    case 'goal_diff':
      return 'goal_diff';
    case 'total_goals':
      return 'total_goals';
    case 'btts':
      return 'btts';
    case 'first_team':
      return 'first_scoring_team';
    case 'first_scorer':
      return 'first_goalscorer';
    default:
      return 'correct_score';
  }
}

interface LoadedFixture {
  id: string;
  status: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  marketIdsByCode: Map<string, string>;
  events: Array<{ type: string; minute: number | null; teamId: string | null; playerId: string | null }>;
}

async function loadFixture(client: Db, fixtureId: string): Promise<LoadedFixture> {
  const { data, error } = await client
    .from('fixtures')
    .select(
      `id, status, home_team_id, away_team_id, home_score, away_score,
       markets ( id, market_types ( code ) ),
       fixture_events ( type, minute, added_min, team_id, player_id )`,
    )
    .eq('id', fixtureId)
    .single();

  if (error) throw error;

  const marketIdsByCode = new Map<string, string>();
  for (const market of data.markets ?? []) {
    const code = market.market_types?.code;
    if (code) marketIdsByCode.set(code, market.id);
  }

  return {
    id: data.id,
    status: data.status,
    homeTeamId: data.home_team_id,
    awayTeamId: data.away_team_id,
    homeScore: data.home_score ?? 0,
    awayScore: data.away_score ?? 0,
    marketIdsByCode,
    events: (data.fixture_events ?? []).map((e: Record<string, unknown>) => ({
      type: String(e.type),
      minute: (e.minute as number | null) ?? null,
      teamId: (e.team_id as string | null) ?? null,
      playerId: (e.player_id as string | null) ?? null,
    })),
  };
}

/**
 * Derives the settlement outcome from the fixture and its events.
 *
 * The first goal is the earliest goal event by minute. An own goal counts for the team
 * that benefited — the scoring team is the *opponent* of the player's team — but no
 * first-scorer pick can hit it, which is what firstGoalWasOwnGoal carries through to the
 * settler.
 */
export function buildOutcome(fixture: LoadedFixture): FixtureOutcome {
  const goals = fixture.events
    .filter((e) => e.type === 'goal' || e.type === 'own_goal' || e.type === 'penalty_goal')
    .sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));

  const first = goals[0];
  const ownGoal = first?.type === 'own_goal';

  const scoringTeamId = first
    ? ownGoal
      ? first.teamId === fixture.homeTeamId
        ? fixture.awayTeamId
        : fixture.homeTeamId
      : first.teamId
    : null;

  return {
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    firstScoringTeamId: (scoringTeamId ?? null) as never,
    firstGoalscorerId: (first?.playerId ?? null) as never,
    equivalentScorerIds: [] as never,
    firstGoalWasOwnGoal: ownGoal,
  };
}

async function loadPredictions(
  client: Db,
  fixtureId: string,
): Promise<Map<string, FixturePrediction>> {
  const { data, error } = await client
    .from('predictions')
    .select('user_id, value, markets!inner ( fixture_id, market_types ( code ) )')
    .eq('markets.fixture_id', fixtureId);

  if (error) throw error;

  const byUser = new Map<string, FixturePrediction>();

  for (const row of data ?? []) {
    const code = row.markets?.market_types?.code;
    if (!code) continue;

    const current: FixturePrediction = byUser.get(row.user_id) ?? {
      score: { home: 0, away: 0 },
      goalDiff: null,
      totalGoals: null,
      btts: null,
      firstScoringTeam: { teamId: null, none: false },
      firstGoalscorer: { playerId: null, none: false },
    };

    const value = row.value as Record<string, unknown>;
    switch (code) {
      case 'correct_score':
        current.score = { home: Number(value.home), away: Number(value.away) };
        break;
      case 'goal_diff':
        current.goalDiff = value.value == null ? null : Number(value.value);
        break;
      case 'total_goals':
        current.totalGoals = value.value == null ? null : Number(value.value);
        break;
      case 'btts':
        current.btts = value.value == null ? null : Boolean(value.value);
        break;
      case 'first_scoring_team':
        current.firstScoringTeam = {
          teamId: (value.teamId as never) ?? null,
          none: Boolean(value.none),
        };
        break;
      case 'first_goalscorer':
        current.firstGoalscorer = {
          playerId: (value.playerId as never) ?? null,
          none: Boolean(value.none),
        };
        break;
    }

    byUser.set(row.user_id, current);
  }

  return byUser;
}

async function loadExistingComponents(
  client: Db,
  fixtureId: string,
): Promise<Map<string, { hit: boolean; raw: Json }>> {
  const { data } = await client
    .from('score_components')
    .select('user_id, market_id, category, hit, raw, markets!inner ( fixture_id )')
    .eq('markets.fixture_id', fixtureId);

  const map = new Map<string, { hit: boolean; raw: Json }>();
  for (const row of data ?? []) {
    map.set(`${row.user_id}:${row.market_id}:${row.category}`, { hit: row.hit, raw: row.raw });
  }
  return map;
}

async function loadDefaultRuleSetVersion(client: SupabaseClient): Promise<string> {
  const { data, error } = await client
    .from('rule_set_versions')
    .select('id')
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error) throw error;
  return data.id;
}
