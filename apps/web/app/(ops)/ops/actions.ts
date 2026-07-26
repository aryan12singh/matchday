'use server';

import { revalidatePath } from 'next/cache';

import type { Json } from '@matchday/domain';
import { settleFixtureMarkets } from '@matchday/jobs';

import { getSessionUser } from '../../../lib/auth';
import { createServiceClient } from '../../../lib/supabase/service';

export interface OpsState {
  error?: string;
  notice?: string;
}

/**
 * Every action here re-checks platform admin.
 *
 * The layout already gates the page, but these are server actions — they are callable by
 * anyone who can construct the request, regardless of which page rendered the form. A
 * layout check protects the view, not the endpoint.
 *
 * Each one is also audited, because §10.3 requires every /ops mutation to leave a trail.
 */
async function requireAdmin(): Promise<{ id: string } | { error: string }> {
  const user = await getSessionUser();
  if (!user) return { error: 'Not signed in.' };
  if (!user.isPlatformAdmin) return { error: 'Not a platform admin.' };
  return { id: user.id };
}

async function audit(actorId: string, action: string, target: Json) {
  const db = createServiceClient();
  await db.from('admin_audit_log').insert({ actor_user_id: actorId, action, target });
}

/**
 * Re-runs settlement for one fixture.
 *
 * Idempotent by construction: it takes the same advisory lock and upsert path as the
 * automated run (§10.3, "shared code path requirement"), so an accidental double-click
 * produces a second score run with zero changes rather than a second set of points.
 */
export async function rerunSettlement(
  _previous: OpsState,
  formData: FormData,
): Promise<OpsState> {
  const admin = await requireAdmin();
  if ('error' in admin) return { error: admin.error };

  const fixtureId = String(formData.get('fixtureId') ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(fixtureId)) return { error: 'That is not a fixture id.' };

  try {
    const result = await settleFixtureMarkets(createServiceClient(), fixtureId, 'manual');

    if (result == null) {
      // Not an error: another run holds the lock, which is the concurrency guard working.
      return { notice: 'Another settlement run is already working on that fixture.' };
    }

    await audit(admin.id, 'rerun_settlement', { fixture_id: fixtureId, run: result.scoreRunId });
    revalidatePath('/ops');

    return {
      notice:
        result.componentsChanged > 0
          ? `Re-ran: ${result.componentsWritten} components, ${result.componentsChanged} changed. Diffs are in score_run_changes.`
          : `Re-ran: ${result.componentsWritten} components, nothing changed.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Settlement failed.' };
  }
}

/** Sweeps markets whose kickoff has passed. Safe to run any time. */
export async function runLockSweep(): Promise<OpsState> {
  const admin = await requireAdmin();
  if ('error' in admin) return { error: admin.error };

  const db = createServiceClient();
  const { data, error } = await db.rpc('lock_markets_sweep');
  if (error) return { error: 'Sweep failed.' };

  await audit(admin.id, 'lock_markets_sweep', { locked: data ?? 0 });
  revalidatePath('/ops');
  return { notice: `Locked ${data ?? 0} market${data === 1 ? '' : 's'}.` };
}

/** Applies the addendum §B fallback for any round inside its 24h window. */
export async function runSelectionFallbacks(): Promise<OpsState> {
  const admin = await requireAdmin();
  if ('error' in admin) return { error: admin.error };

  const db = createServiceClient();
  const { data, error } = await db.rpc('apply_selection_fallbacks');
  if (error) return { error: 'Fallback run failed.' };

  await audit(admin.id, 'apply_selection_fallbacks', { applied: data ?? 0 });
  revalidatePath('/ops');
  return { notice: `Applied ${data ?? 0} fallback${data === 1 ? '' : 's'}.` };
}
