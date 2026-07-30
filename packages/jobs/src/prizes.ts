import {
  DEFAULT_WEIGHTS,
  type Database,
  type RuleSetDefinition,
  resolveWeights,
  ruleSetDefinitionSchema,
} from '@matchday/domain';
import {
  aggregateLeaderboard,
  allocatePrizes,
  parsePrizeScheme,
  toComponentRows,
} from '@matchday/scoring';
import type { SupabaseClient } from '@supabase/supabase-js';

import { withAdvisoryLock } from './locks';
import { runJob } from './sync-runs';

type Db = SupabaseClient<Database>;

/**
 * Prize settlement — writing who owes whom into the ledger.
 *
 * The scheme has been configurable since the admin screen was built, and nothing has ever
 * written a `prize_settlements` row. So a league could turn prizes on, see the money UI
 * appear everywhere, and never get a number out of it.
 *
 * Amounts are never edited in place. A correction — which happens whenever a provider
 * revises a result and settlement re-runs — inserts a fresh row pointing at the one it
 * replaces through `revised_from`, exactly as the schema comment demands. Money changing
 * silently is how people stop trusting a ledger, so the previous figure stays readable.
 */

export interface PrizeSettlementResult {
  leagueSeasonId: string;
  periodRoundId: string | null;
  entrants: number;
  written: number;
  revised: number;
  unchanged: number;
  skipped: 'no-scheme' | 'no-table' | 'unbalanced' | null;
}

export async function settleLeaguePrizes(
  client: Db,
  leagueSeasonId: string,
  options: { roundId?: string | null; roundNumber?: number | null; scoreRunId?: string | null } = {},
): Promise<PrizeSettlementResult | null> {
  const periodRoundId = options.roundId ?? null;

  return withAdvisoryLock(client, `prizes:${leagueSeasonId}:${periodRoundId ?? 'overall'}`, () =>
    runJob(
      client,
      'settle_prizes',
      'tick',
      { league_season_id: leagueSeasonId, round_id: periodRoundId },
      async () => {
        const base: PrizeSettlementResult = {
          leagueSeasonId,
          periodRoundId,
          entrants: 0,
          written: 0,
          revised: 0,
          unchanged: 0,
          skipped: null,
        };

        // The FK is named because league_seasons and prize_schemes reference each other —
        // a scheme belongs to a league season, and a league season points at its active
        // scheme. A bare `prize_schemes ( … )` embed is ambiguous and errors, which without
        // an error check reads exactly like "this league has no scheme".
        const { data: leagueSeason, error: leagueSeasonError } = await client
          .from('league_seasons')
          .select(
            'id, league_id, prize_scheme_id, prize_schemes!league_seasons_prize_scheme_fk ( kind, definition )',
          )
          .eq('id', leagueSeasonId)
          .maybeSingle();
        if (leagueSeasonError) throw leagueSeasonError;

        // No scheme means a points-only league. Not an error — it is the default, and the
        // money UI stays hidden throughout.
        if (!leagueSeason?.prize_scheme_id || !leagueSeason.prize_schemes) {
          return { result: { ...base, skipped: 'no-scheme' as const }, recordsWritten: 0 };
        }

        const scheme = parsePrizeScheme(
          (leagueSeason.prize_schemes as unknown as { kind: string }).kind,
          (leagueSeason.prize_schemes as unknown as { definition: unknown }).definition,
        );

        const table = periodRoundId ? scheme?.perRound : scheme?.overall;
        if (!table || table.length === 0) {
          return { result: { ...base, skipped: 'no-table' as const }, recordsWritten: 0 };
        }

        // The database refuses to store an unbalanced table, but a scheme predating that
        // check would produce a ledger we already know to be wrong. Refuse to write it.
        const sum = Math.round(table.reduce((a, b) => a + b, 0) * 100) / 100;
        if (sum !== 0) {
          return { result: { ...base, skipped: 'unbalanced' as const }, recordsWritten: 0 };
        }

        const [{ data: components }, { data: definition }, { data: members }] = await Promise.all([
          client.rpc('league_score_components', {
            p_league_season_id: leagueSeasonId,
            p_round_id: periodRoundId ?? undefined,
          }),
          client.rpc('league_weights', {
            p_league_season_id: leagueSeasonId,
            p_round_number: options.roundNumber ?? undefined,
          }),
          client
            .from('league_members')
            .select('user_id, joined_at, profiles ( username, avatar_url )')
            .eq('league_id', leagueSeason.league_id),
        ]);

        const parsed = definition ? ruleSetDefinitionSchema.safeParse(definition) : null;
        const weights =
          parsed?.success === true
            ? resolveWeights(parsed.data as RuleSetDefinition)
            : DEFAULT_WEIGHTS;

        const rows = aggregateLeaderboard({
          // toComponentRows drops categories this build does not understand, which is the
          // same filter the leaderboard screens use — the ledger must be computed from
          // exactly the board people can see.
          components: toComponentRows(components ?? []),
          members: (members ?? []).map((m) => ({
            userId: m.user_id,
            username: m.profiles?.username ?? 'player',
            avatarUrl: m.profiles?.avatar_url ?? null,
            joinedAt: m.joined_at,
          })),
          weights,
        });

        base.entrants = rows.length;

        const allocations = allocatePrizes(
          rows.map((row) => ({ userId: row.userId, rank: row.rank })),
          table,
        );

        // What the ledger currently says, so an unchanged amount is left alone rather than
        // re-inserted. Re-running settlement is routine; it must not grow the ledger.
        let existingQuery = client
          .from('prize_settlements')
          .select('id, user_id, amount, settled_at')
          .eq('league_season_id', leagueSeasonId);

        // A null period means the overall season prize, and `is null` is not the same
        // filter as `eq null` — the latter matches nothing.
        existingQuery = periodRoundId
          ? existingQuery.eq('period_round_id', periodRoundId)
          : existingQuery.is('period_round_id', null);

        const { data: existing } = await existingQuery.order('settled_at', { ascending: false });

        const latest = new Map<string, { id: string; amount: number }>();
        for (const row of existing ?? []) {
          if (!latest.has(row.user_id)) {
            latest.set(row.user_id, { id: row.id, amount: Number(row.amount) });
          }
        }

        for (const allocation of allocations) {
          const current = latest.get(allocation.userId);

          if (current && Math.abs(current.amount - allocation.amount) < 0.005) {
            base.unchanged += 1;
            continue;
          }

          const { error } = await client.from('prize_settlements').insert({
            league_season_id: leagueSeasonId,
            period_round_id: periodRoundId,
            user_id: allocation.userId,
            amount: allocation.amount,
            score_run_id: options.scoreRunId ?? null,
            revised_from: current?.id ?? null,
          });
          if (error) throw error;

          if (current) base.revised += 1;
          else base.written += 1;
        }

        return {
          result: base,
          recordsRead: rows.length,
          recordsWritten: base.written + base.revised,
        };
      },
    ),
  );
}
