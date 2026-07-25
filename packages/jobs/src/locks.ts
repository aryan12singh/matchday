import type { Database } from '@matchday/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

type Db = SupabaseClient<Database>;

/**
 * Postgres advisory locks, one per job scope.
 *
 * Invariant 5: every job is re-runnable and idempotent. Idempotent is not the same as
 * safe-to-run-concurrently — two settlement runs over the same fixture would both read
 * "no components yet", both compute, and both write, producing duplicate score_run rows
 * and a meaningless diff log. The lock makes concurrency impossible rather than merely
 * unlikely.
 *
 * Advisory locks are held on the *session*, so this must run through a connection that
 * lives for the length of the job. It is released in a finally block, and Postgres
 * releases it anyway if the connection dies — a crashed job cannot wedge the scope.
 */

/** Stable 64-bit key from a scope string, so the same scope always maps to the same lock. */
export function lockKey(scope: string): number {
  // FNV-1a, folded into the signed 32-bit range Postgres accepts for the 1-arg form.
  let hash = 0x811c9dc5;
  for (let i = 0; i < scope.length; i += 1) {
    hash ^= scope.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

export class LockNotAcquiredError extends Error {
  constructor(readonly scope: string) {
    super(`Another run already holds the lock for ${scope}`);
    this.name = 'LockNotAcquiredError';
  }
}

/**
 * Runs `work` while holding the advisory lock for `scope`. Returns null when the lock is
 * already held — a second tick arriving while the first is still working is normal, not
 * an error, so callers usually skip rather than retry.
 */
export async function withAdvisoryLock<T>(
  client: Db,
  scope: string,
  work: () => Promise<T>,
): Promise<T | null> {
  const key = lockKey(scope);

  const { data: acquired, error } = await client.rpc('try_advisory_lock', { p_key: key });
  if (error) throw error;
  if (!acquired) return null;

  try {
    return await work();
  } finally {
    // Best effort: if this fails the connection is already gone, which releases it too.
    await client.rpc('release_advisory_lock', { p_key: key });
  }
}
