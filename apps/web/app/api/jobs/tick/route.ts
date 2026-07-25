import { timingSafeEqual } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

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

  const client = createServiceClient();
  const started = Date.now();

  // Ordered by consequence. The lock sweep runs first and unconditionally: reveal
  // policies key off market status, so a late sweep means predictions stay hidden past
  // kickoff — or worse, a market reads "open" to a UI that then offers an input the
  // database will reject.
  const { data: locked } = await client.rpc('lock_markets_sweep');

  // Selection fallbacks: a round unfinalized 24h before its first kickoff counts
  // everything (addendum §B). Cheap, and skipping it can cost a league a matchweek.
  const { data: fallbacks } = await client.rpc('apply_selection_fallbacks');

  return NextResponse.json({
    ok: true,
    marketsLocked: locked ?? 0,
    selectionFallbacks: fallbacks ?? 0,
    durationMs: Date.now() - started,
  });
}

// GET is rejected on purpose: a tick has side effects, and a URL that mutates state is a
// URL a crawler or a preview fetcher will eventually hit.
export function GET() {
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 });
}
