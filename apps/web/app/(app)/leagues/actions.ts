'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createClient } from '../../../lib/supabase/server';

/**
 * League mutations. Each one calls a SECURITY DEFINER function rather than writing
 * tables directly: creation must be atomic with organizer membership, and the
 * organizer checks belong next to the write, not in a route handler that could be
 * bypassed by a future caller.
 */

export interface ActionState {
  error?: string;
  notice?: string;
}

export async function createLeague(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = z.string().min(2, 'Give your league a name.').max(60).safeParse(formData.get('name'));
  if (!name.success) return { error: name.error.issues[0]?.message ?? 'Give your league a name.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_league', { p_name: name.data });

  if (error || !data || data.length === 0) {
    return { error: error?.message ?? 'Could not create that league.' };
  }

  const leagueId = data[0]!.league_id;

  // Enrol straight away. A league with no season has nothing to predict, and the
  // enrolment also binds rule set v1 — without a binding every member scores zero,
  // which is indistinguishable from a scoring bug.
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();

  if (season) {
    await supabase.rpc('enrol_league_season', {
      p_league_id: leagueId,
      p_season_id: season.id,
      p_reveal_policy: 'at_kickoff',
      p_selection_mode: 'all',
    });
  }

  revalidatePath('/leagues');
  redirect(`/leagues/${leagueId}`);
}

export async function joinLeague(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = z
    .string()
    .trim()
    .min(6, 'That code looks too short.')
    .safeParse(formData.get('code'));
  if (!code.success) return { error: code.error.issues[0]?.message ?? 'Check the code.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('join_league', { p_code: code.data });

  if (error || !data) {
    // The function raises the same shape for "no such code", so this message covers both
    // without telling an attacker which codes exist.
    return { error: "That code didn't work. Check it with whoever invited you." };
  }

  revalidatePath('/leagues');
  redirect(`/leagues/${data}`);
}

export async function leaveLeague(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const supabase = await createClient();
  await supabase.rpc('leave_league', { p_league_id: leagueId });
  revalidatePath('/leagues');
  redirect('/leagues');
}

export async function regenerateJoinCode(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.rpc('regenerate_join_code', { p_league_id: leagueId });

  if (error) return { error: 'Only an organizer can do that.' };

  revalidatePath(`/leagues/${leagueId}`);
  return { notice: 'New code generated. The old one no longer works.' };
}

const settings = z.object({
  leagueSeasonId: z.string().uuid(),
  revealPolicy: z.enum(['at_kickoff', 'always', 'after_own_submission']).optional(),
  selectionMode: z.enum(['all', 'admin_pick', 'vote']).optional(),
  fixturesPerRound: z.coerce.number().int().optional(),
});

export async function updateLeagueSettings(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = Object.fromEntries(formData);
  const parsed = settings.safeParse({
    ...raw,
    // An empty target means "no target" (addendum §H.1); -1 is the function's clear signal.
    fixturesPerRound: raw.fixturesPerRound === '' ? -1 : raw.fixturesPerRound,
  });
  if (!parsed.success) return { error: 'Those settings are not valid.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('update_league_season_settings', {
    p_league_season_id: parsed.data.leagueSeasonId,
    p_reveal_policy: parsed.data.revealPolicy,
    p_selection_mode: parsed.data.selectionMode,
    p_fixtures_per_round: parsed.data.fixturesPerRound,
  });

  if (error) return { error: 'Only an organizer can change league settings.' };

  revalidatePath('/leagues');
  return { notice: 'Settings saved.' };
}
