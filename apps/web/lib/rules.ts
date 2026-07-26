import 'server-only';

import {
  type RuleSetDefinition,
  DEFAULT_WEIGHTS,
  SCORE_CATEGORIES,
  resolveWeights,
  ruleSetDefinitionSchema,
} from '@matchday/domain';

import { CATEGORY_COPY } from './scoring-copy';
import { createClient } from './supabase/server';

export { CATEGORY_COPY };

/**
 * Scoring rules, rendered from the database rather than hard-coded (§6.1, "transparent").
 *
 * If this page and the settlement engine could disagree, the page would be a lie the
 * first time a league edited its weights. Both read the same rule_set_versions row.
 */


export interface RulesView {
  leagueName: string | null;
  version: number | null;
  effectiveFromRound: number | null;
  weights: Record<string, number>;
  tiebreaks: string[];
  history: Array<{ version: number; effectiveFromRound: number; notes: string | null; boundAt: string }>;
}

export async function getRules(leagueSeasonId?: string | null): Promise<RulesView> {
  const supabase = await createClient();

  // No league selected: show the seeded default so the page is never blank.
  if (!leagueSeasonId) {
    const { data } = await supabase
      .from('rule_set_versions')
      .select('version, definition')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const parsed = data ? ruleSetDefinitionSchema.safeParse(data.definition) : null;

    return {
      leagueName: null,
      version: data?.version ?? null,
      effectiveFromRound: null,
      weights: parsed?.success ? resolveWeights(parsed.data as RuleSetDefinition) : DEFAULT_WEIGHTS,
      tiebreaks: parsed?.success ? parsed.data.tiebreaks : [...SCORE_CATEGORIES],
      history: [],
    };
  }

  const [{ data: definition }, { data: bindings }, { data: league }] = await Promise.all([
    supabase.rpc('league_weights', { p_league_season_id: leagueSeasonId }),
    supabase
      .from('league_rule_bindings')
      .select('effective_from_round, bound_at, rule_set_versions ( version, notes )')
      .eq('league_season_id', leagueSeasonId)
      .order('effective_from_round', { ascending: false }),
    supabase
      .from('league_seasons')
      .select('leagues ( name )')
      .eq('id', leagueSeasonId)
      .maybeSingle(),
  ]);

  const parsed = definition ? ruleSetDefinitionSchema.safeParse(definition) : null;
  const current = bindings?.[0];

  return {
    leagueName: league?.leagues?.name ?? null,
    version: current?.rule_set_versions?.version ?? null,
    effectiveFromRound: current?.effective_from_round ?? null,
    weights: parsed?.success ? resolveWeights(parsed.data as RuleSetDefinition) : DEFAULT_WEIGHTS,
    tiebreaks: parsed?.success ? parsed.data.tiebreaks : [],
    history: (bindings ?? []).map((binding) => ({
      version: binding.rule_set_versions?.version ?? 0,
      effectiveFromRound: binding.effective_from_round,
      notes: binding.rule_set_versions?.notes ?? null,
      boundAt: binding.bound_at,
    })),
  };
}
