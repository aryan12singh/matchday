'use server';

import { revalidatePath } from 'next/cache';
import { SCORE_CATEGORIES } from '@matchday/domain';
import { z } from 'zod';

import { createClient } from '../../../../../lib/supabase/server';

export interface AdminState {
  error?: string;
  notice?: string;
}

/**
 * Weight editor. Writes a NEW immutable version bound from a chosen round — it never
 * edits the current one, and the database would refuse if it tried (invariant 4).
 */
export async function saveWeights(
  _previous: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const leagueSeasonId = String(formData.get('leagueSeasonId') ?? '');
  const effectiveFrom = Number(formData.get('effectiveFromRound') ?? 1);

  const categories: Record<string, { enabled: boolean; weight: number }> = {};
  for (const category of SCORE_CATEGORIES) {
    const raw = Number(formData.get(`w:${category}`) ?? 0);
    if (!Number.isFinite(raw) || raw < 0 || raw > 99) {
      return { error: `"${category}" must be between 0 and 99.` };
    }
    // Weight 0 stays enabled rather than disabled: the category keeps being settled, so
    // switching it back on later needs no re-scoring.
    categories[category] = { enabled: true, weight: raw };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('create_rule_set_version', {
    p_definition: {
      categories,
      params: {
        team_goals_only_when_exact_missed: true,
        first_scorer_excludes_own_goals: true,
      },
      tiebreaks: ['points', ...SCORE_CATEGORIES, 'submissions'],
    },
    p_league_season_id: leagueSeasonId,
    p_effective_from_round: effectiveFrom,
    p_notes: `Weights edited, effective from matchweek ${effectiveFrom}`,
  });

  if (error) {
    if (error.code === '42501') return { error: 'Only an organizer can change scoring.' };
    if (/already been played/.test(error.message)) {
      return { error: 'That matchweek has already been played. Pick a later one.' };
    }
    return { error: 'Could not save the rule change.' };
  }

  revalidatePath('/rules');
  revalidatePath('/leagues');
  return { notice: `Saved. Applies from matchweek ${effectiveFrom} onward — nothing already played is re-scored.` };
}

const prizeSchema = z.object({
  leagueSeasonId: z.string().uuid(),
  currencyLabel: z.string().max(4).default('£'),
  perRound: z.string(),
  overall: z.string(),
});

/** Zero-sum prize table. The database validates that each table sums to zero. */
export async function savePrizeScheme(
  _previous: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const parsed = prizeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Check the amounts.' };

  const toNumbers = (input: string) =>
    input
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map(Number);

  const perRound = toNumbers(parsed.data.perRound);
  const overall = toNumbers(parsed.data.overall);

  if ([...perRound, ...overall].some((n) => !Number.isFinite(n))) {
    return { error: 'Amounts must be numbers, e.g. "15, 10, 5, 0, -5, -10, -15".' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('upsert_prize_scheme', {
    p_league_season_id: parsed.data.leagueSeasonId,
    p_kind: 'zero_sum_rank_table',
    p_currency_label: parsed.data.currencyLabel,
    p_definition: { per_round: perRound, overall },
  });

  if (error) {
    if (/add up to zero/.test(error.message)) {
      return { error: 'A zero-sum table has to balance — the amounts must add up to 0.' };
    }
    if (/prize table has/.test(error.message)) {
      return { error: error.message.replace(/^.*?: /, '') };
    }
    if (error.code === '42501') return { error: 'Only an organizer can configure prizes.' };
    return { error: 'Could not save the prize scheme.' };
  }

  revalidatePath('/leagues');
  return { notice: 'Prize scheme active. Money now shows across the league.' };
}

export async function clearPrizes(
  _previous: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('clear_prize_scheme', {
    p_league_season_id: String(formData.get('leagueSeasonId') ?? ''),
  });

  if (error) return { error: 'Could not turn prizes off.' };

  revalidatePath('/leagues');
  return { notice: 'Prizes off. This is a points-only league again and all money UI is hidden.' };
}

export async function changeMemberRole(formData: FormData): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc('set_member_role', {
    p_league_id: String(formData.get('leagueId') ?? ''),
    p_user_id: String(formData.get('userId') ?? ''),
    p_role: String(formData.get('role') ?? 'member'),
  });
  revalidatePath('/leagues');
}

export async function removeMember(formData: FormData): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc('remove_member', {
    p_league_id: String(formData.get('leagueId') ?? ''),
    p_user_id: String(formData.get('userId') ?? ''),
  });
  revalidatePath('/leagues');
}
