'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '../../../lib/supabase/server';

/**
 * Autosave for a fixture card. There is no save button by design
 * (design/README.md §2: "Saved automatically · editable until each kickoff"), so this is
 * called on every change with the whole card.
 *
 * It returns a result rather than throwing, because the one failure that matters —
 * writing after kickoff — is an ordinary outcome the UI must render inline as the
 * save-conflict state, not an exception.
 */

const payload = z.object({
  fixtureId: z.string().uuid(),
  home: z.number().int().min(0).max(99),
  away: z.number().int().min(0).max(99),
  goalDiff: z.number().int().min(-99).max(99).nullable(),
  totalGoals: z.number().int().min(0).max(99).nullable(),
  btts: z.boolean().nullable(),
  firstTeamId: z.string().uuid().nullable(),
  firstTeamNone: z.boolean(),
  firstScorerId: z.string().uuid().nullable(),
  firstScorerNone: z.boolean(),
});

export type SavePredictionInput = z.infer<typeof payload>;

export type SaveResult =
  | { status: 'saved'; at: string }
  | { status: 'locked'; message: string }
  | { status: 'error'; message: string };

export async function savePrediction(input: SavePredictionInput): Promise<SaveResult> {
  const parsed = payload.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid prediction.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('save_fixture_prediction', {
    p_fixture_id: parsed.data.fixtureId,
    p_home: parsed.data.home,
    p_away: parsed.data.away,
    p_goal_diff: parsed.data.goalDiff ?? undefined,
    p_total_goals: parsed.data.totalGoals ?? undefined,
    p_btts: parsed.data.btts ?? undefined,
    p_first_team_id: parsed.data.firstTeamId ?? undefined,
    p_first_team_none: parsed.data.firstTeamNone,
    p_first_scorer_id: parsed.data.firstScorerId ?? undefined,
    p_first_scorer_none: parsed.data.firstScorerNone,
  });

  if (error) {
    // 23514 is what enforce_prediction_lock raises. The design calls for a specific
    // inline banner here — "Locked at kickoff — not saved", earlier pick stands — rather
    // than a generic failure, because the user needs to know their previous answer
    // survived.
    if (error.code === '23514' && /locked/i.test(error.message)) {
      return { status: 'locked', message: 'Locked at kickoff — not saved. Your earlier pick stands.' };
    }
    return { status: 'error', message: 'Could not save. We will retry.' };
  }

  revalidatePath('/predict');
  return { status: 'saved', at: new Date().toISOString() };
}

export async function saveSeasonTable(seasonId: string, order: string[]): Promise<SaveResult> {
  if (order.length !== 20 || new Set(order).size !== 20) {
    return { status: 'error', message: 'Rank all 20 teams exactly once.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('save_season_table_prediction', {
    p_season_id: seasonId,
    p_order: order,
  });

  if (error) {
    if (error.code === '23514' && /locked/i.test(error.message)) {
      return {
        status: 'locked',
        message: 'The season has started — the table locked at the first kickoff.',
      };
    }
    return { status: 'error', message: 'Could not save your table.' };
  }

  revalidatePath('/table');
  return { status: 'saved', at: new Date().toISOString() };
}

export async function saveGoldenBoot(seasonId: string, playerId: string): Promise<SaveResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_golden_boot_prediction', {
    p_season_id: seasonId,
    p_player_id: playerId,
  });

  if (error) {
    if (error.code === '23514' && /locked/i.test(error.message)) {
      return { status: 'locked', message: 'The season has started — Golden Boot is locked.' };
    }
    return { status: 'error', message: 'Could not save your pick.' };
  }

  revalidatePath('/table');
  return { status: 'saved', at: new Date().toISOString() };
}
