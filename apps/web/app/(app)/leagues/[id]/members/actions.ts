'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '../../../../../lib/supabase/server';

/**
 * Rivals are own-row only (RLS `rivals_own_write`), so this needs no organizer check —
 * you can only ever pin someone for yourself.
 */
export async function toggleRival(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const rivalId = String(formData.get('rivalId') ?? '');
  const pinned = formData.get('pinned') === 'true';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (pinned) {
    await supabase
      .from('rivals')
      .delete()
      .eq('user_id', user.id)
      .eq('league_id', leagueId)
      .eq('rival_user_id', rivalId);
  } else {
    await supabase
      .from('rivals')
      .insert({ user_id: user.id, league_id: leagueId, rival_user_id: rivalId });
  }

  revalidatePath(`/leagues/${leagueId}/members`);
  revalidatePath('/home');
}
