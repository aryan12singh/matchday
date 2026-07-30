import { timingSafeEqual } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { createProviderConfig, runTick } from '@matchday/jobs';

import { createServiceClient } from '../../../../lib/supabase/service';

/**
 * Tick entry point — pg_cron -> pg_net -> here (D3, addendum §F).
 *
 * Vercel Hobby's once-daily cron limit is irrelevant because the schedule lives in
 * Postgres, but the ~4h active-CPU/month cap is not: pg_cron only calls this when its
 * SQL-side "anything due?" check says there is work, and this route does the least
 * possible when there is not.
 *
 * Auth is a constant-time bearer comparison. A timing-variable compare on a secret this
 * long is not a realistic attack, but the pattern is worth keeping honest — the same
 * helper will guard the individual job routes.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const client = createServiceClient();

  // Schedule sync needs no key and always runs; live scores and events engage only when
  // an API-Football key is configured.
  const result = await runTick(client, createProviderConfig(client));

  // 200 even with step errors: pg_cron has no useful reaction to a 500, and a
  // non-2xx would obscure the steps that did succeed. The errors are in the body and
  // in sync_runs, which is where /ops looks.
  return NextResponse.json({ ok: result.errors.length === 0, ...result, durationMs: Date.now() - started });
}

// GET is rejected on purpose: a tick has side effects, and a URL that mutates state is a
// URL a crawler or a preview fetcher will eventually hit.
export function GET() {
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 });
}
