import type { Metadata } from 'next';
import Link from 'next/link';

import { inspectFixture } from '../../../../../lib/ops';

export const metadata: Metadata = { title: 'Fixture · ops' };
export const dynamic = 'force-dynamic';

/**
 * Raw payload inspector (§4.2 screen 18).
 *
 * Data access lives in lib/ops.ts rather than here: repo-check forbids a .tsx importing
 * the service client, because a .tsx is one `'use client'` away from shipping the service
 * key to a browser.
 */
export default async function OpsFixturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fixture = await inspectFixture(id);

  if (!fixture) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/ops" className="label text-text-3">‹ Ops</Link>
        <p className="pt-4 text-[14px] text-text-2">No fixture with that id.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
      <Link
        href="/ops"
        className="inline-flex min-h-tap items-center font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
      >
        ‹ Ops
      </Link>

      <header className="flex flex-col gap-1">
        <p className="label">{fixture.status}</p>
        <h1 className="font-display text-[24px] font-extrabold">
          {fixture.homeName} {fixture.homeScore ?? '–'}:{fixture.awayScore ?? '–'}{' '}
          {fixture.awayName}
        </h1>
        <p className="font-num text-[12px] tabular-nums text-text-3">
          {new Date(fixture.kickoffAt).toLocaleString()}
          {fixture.manualOverride ? ' · MANUALLY OVERRIDDEN' : ''}
          {fixture.resultHash ? ` · hash ${fixture.resultHash.slice(0, 12)}` : ''}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="label">Events ({fixture.events.length})</h2>
        {fixture.events.length === 0 ? (
          <p className="text-[13px] text-text-3">
            No events. A finished fixture with no events settles first-scorer against
            nobody — worth checking before re-running.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {fixture.events.map((event, index) => (
              <li key={index} className="flex items-baseline gap-3 py-2">
                <span className="w-10 font-num text-[12px] tabular-nums text-text-3">
                  {event.minute ?? '—'}&apos;
                </span>
                <span className="flex-1 text-[13px]">{event.type}</span>
                <span className="truncate font-num text-[11px] text-text-3">
                  {event.providerEventKey ?? 'no key'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="label">Settled components</h2>
        <p className="text-[13px] text-text-2">
          <span className="font-num tabular-nums">{fixture.componentCount}</span> components,{' '}
          <span className="font-num tabular-nums">{fixture.hitCount}</span> hits, across{' '}
          <span className="font-num tabular-nums">{fixture.userCount}</span> users.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label">Recent raw payloads</h2>
        {fixture.payloads.length === 0 ? (
          <p className="text-[13px] text-text-3">
            Nothing archived yet — expected until the provider key is in place.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {fixture.payloads.map((payload) => (
              <li key={payload.id} className="flex items-baseline gap-3 py-2">
                <span className="flex-1 truncate font-num text-[12px]">{payload.endpoint}</span>
                <span className="font-num text-[12px] tabular-nums text-text-3">
                  {payload.httpStatus}
                </span>
                <span className="font-num text-[11px] tabular-nums text-text-3">
                  {new Date(payload.fetchedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
