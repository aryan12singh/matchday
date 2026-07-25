import type { Database, Json } from '@matchday/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

type Db = SupabaseClient<Database>;

/**
 * Sync run bookkeeping — ported and extended from ../wc26-predictor/lib/sync-runs.ts.
 *
 * Every job opens a run, and every run closes exactly once, including when the job
 * throws. A run stuck in 'running' is the signal that something died mid-flight, and the
 * /ops health board keys off it — so the finally block matters more than the happy path.
 */

export type TriggerSource = 'tick' | 'admin' | 'cli' | 'retry';
export type RunStatus = 'running' | 'success' | 'partial' | 'failed';

export interface RunHandle {
  id: string;
  kind: string;
}

export interface RunTotals {
  recordsRead: number;
  recordsWritten: number;
}

export async function startRun(
  client: Db,
  kind: string,
  triggerSource: TriggerSource,
  scope: Json = {},
): Promise<RunHandle> {
  const { data, error } = await client
    .from('sync_runs')
    .insert({ kind, trigger_source: triggerSource, scope, status: 'running' })
    .select('id')
    .single();

  if (error) throw error;
  return { id: data.id, kind };
}

export async function finishRun(
  client: Db,
  run: RunHandle,
  status: RunStatus,
  totals: Partial<RunTotals> = {},
  details?: Json,
  errorSummary?: string,
): Promise<void> {
  await client
    .from('sync_runs')
    .update({
      status,
      records_read: totals.recordsRead ?? 0,
      records_written: totals.recordsWritten ?? 0,
      details: details ?? null,
      // Truncated: a stack trace in a status column helps nobody and bloats the table.
      error_summary: errorSummary ? errorSummary.slice(0, 500) : null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', run.id);
}

/**
 * Wraps a job so its run row is always closed. Rethrows after recording the failure —
 * swallowing it would leave the caller thinking the job succeeded.
 */
export async function runJob<T>(
  client: Db,
  kind: string,
  triggerSource: TriggerSource,
  scope: Json,
  work: (run: RunHandle) => Promise<{ result: T } & Partial<RunTotals>>,
): Promise<T> {
  const run = await startRun(client, kind, triggerSource, scope);

  try {
    const { result, recordsRead, recordsWritten } = await work(run);
    await finishRun(client, run, 'success', { recordsRead, recordsWritten });
    return result;
  } catch (error) {
    await finishRun(
      client,
      run,
      'failed',
      {},
      undefined,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

/**
 * Retry with exponential backoff and jitter.
 *
 * Jitter is not decoration: the tick fires every minute on a schedule, so without it
 * every failing job in a matchday retries in lockstep and hammers the provider at the
 * same instants — exactly when the quota is tightest.
 */
export async function withRetry<T>(
  work: () => Promise<T>,
  {
    attempts = 3,
    baseDelayMs = 500,
    isRetryable = () => true,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
  }: {
    attempts?: number;
    baseDelayMs?: number;
    isRetryable?: (error: unknown) => boolean;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
  } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts - 1) break;

      const backoff = baseDelayMs * 2 ** attempt;
      await sleep(backoff + Math.floor(random() * backoff));
    }
  }

  throw lastError;
}
