'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '../../../../../lib/supabase/server';

export type VoteResult = { status: 'ok'; voted: boolean } | { status: 'error'; message: string };
export type FinalizeResult =
  | { status: 'ok'; count: number }
  | { status: 'error'; message: string };

export async function toggleVote(
  leagueSeasonId: string,
  roundId: string,
  fixtureId: string,
): Promise<VoteResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('toggle_fixture_vote', {
    p_league_season_id: leagueSeasonId,
    p_round_id: roundId,
    p_fixture_id: fixtureId,
  });

  if (error) {
    // The trigger raises this once the round is finalized. Worth its own message: the
    // member's vote was not lost, the window simply closed.
    if (error.code === '23514' && /finalized/i.test(error.message)) {
      return { status: 'error', message: 'Voting closed — the organizer has finalised this round.' };
    }
    return { status: 'error', message: 'Could not record your vote.' };
  }

  revalidatePath(`/leagues`);
  return { status: 'ok', voted: Boolean(data) };
}

export async function finalizeSelection(
  leagueSeasonId: string,
  roundId: string,
  fixtureIds: string[],
): Promise<FinalizeResult> {
  if (fixtureIds.length === 0) {
    return { status: 'error', message: 'Pick at least one fixture — a round can never count nothing.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('finalize_round_selection', {
    p_league_season_id: leagueSeasonId,
    p_round_id: roundId,
    p_fixture_ids: fixtureIds,
  });

  if (error) {
    if (error.code === '42501') {
      return { status: 'error', message: 'Only an organizer can finalise the selection.' };
    }
    if (/already kicked off/i.test(error.message)) {
      return { status: 'error', message: 'Too late — the first selected fixture has kicked off.' };
    }
    return { status: 'error', message: 'Could not finalise the selection.' };
  }

  revalidatePath('/leagues');
  revalidatePath('/predict');
  return { status: 'ok', count: Number(data ?? 0) };
}
