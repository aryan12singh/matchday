import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { StateBadge } from '../../../../components/match/StateBadge';
import { TeamChip } from '../../../../components/match/TeamChip';
import { requireUser } from '../../../../lib/auth';
import { getLiveMatch } from '../../../../lib/live';

import { LiveRefresher } from './LiveRefresher';

export const metadata: Metadata = { title: 'Match' };

/**
 * Live Match — design/screens/Live Match v2.dc.html, the signature screen.
 *
 * Desktop gets two columns: scoreboard and category tracker on the left, timeline and
 * league picks on the right. Mobile stacks them in that order, because on a phone the
 * question is "how am I doing", not "what happened at 23 minutes".
 *
 * Everything derived from the live score is labelled provisional. Only finished fixtures
 * settle, and a number that looks final but is not is how a user ends up believing they
 * were robbed.
 */
export default async function LiveMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/live/${id}`);

  const match = await getLiveMatch(id, user.id);
  if (!match) notFound();

  const inPlay = match.status === 'live' || match.status === 'ht';
  const settled = match.status === 'finished' || match.status === 'settled';

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      {/* Polls while the match is in play. Static once it is not. */}
      {inPlay ? <LiveRefresher /> : null}

      <Link
        href="/live"
        className="inline-flex min-h-tap items-center font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
      >
        ‹ Live
      </Link>

      {/* ---------------- scoreboard band ---------------- */}
      <section
        className="hero-band -mx-4 flex flex-col gap-4 px-4 py-6"
        style={{ ['--hero-tint' as string]: inPlay ? 'var(--live-dim)' : 'var(--success-dim)' }}
      >
        <div className="flex items-center gap-3">
          {inPlay ? (
            <StateBadge state="live">
              {match.minute != null ? `Live · ${match.minute}'` : 'Live'}
            </StateBadge>
          ) : (
            <StateBadge state={settled ? 'settled' : 'locked'}>
              {settled ? 'Full time' : undefined}
            </StateBadge>
          )}
          <span className="text-[12.5px] text-text-3">
            {match.venue ? `${match.venue} · ` : ''}
            {new Date(match.kickoffAt).toLocaleString(undefined, {
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <TeamChip code={match.home.code} name={match.home.name} size={40} />
            <span className="truncate font-display text-[16px] font-bold sm:text-[20px]">
              {match.home.name}
            </span>
          </div>

          {/* The 72–84px scoreline the design calls the signature element. */}
          <span className="shrink-0 font-num text-[52px] font-bold leading-none tabular-nums sm:text-[72px]">
            {match.homeScore}
            <span className="px-1 text-text-3">:</span>
            {match.awayScore}
          </span>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
            <span className="truncate text-right font-display text-[16px] font-bold sm:text-[20px]">
              {match.away.name}
            </span>
            <TeamChip code={match.away.code} name={match.away.name} size={40} />
          </div>
        </div>

        {match.prediction ? (
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="font-num text-[32px] font-bold tabular-nums text-accent">
              +{match.provisionalPoints}
            </span>
            <span className="label text-text-2">
              {settled ? 'Final' : 'Projected · not final'}
            </span>
            {!settled ? (
              <span className="text-[12.5px] text-text-3">
                Settles at full time. VAR or official corrections can still change scoring.
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-[13px] text-text-2">You didn&apos;t predict this one.</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
        {/* ---------------- category tracker ---------------- */}
        <section className="flex flex-col gap-3">
          <h2 className="label">My points</h2>

          {match.categories.length === 0 ? (
            <p className="rounded-md bg-surface px-5 py-4 text-[13px] text-text-2 shadow-el-1">
              No prediction, so nothing to track. The scoreline still counts for everyone
              who did.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {match.categories.map((category) => (
                <li
                  key={category.category}
                  className={`flex items-start gap-3 rounded-md bg-surface px-4 py-3 shadow-el-1 ${
                    category.state === 'confirmed'
                      ? 'border-l-[3px] border-success'
                      : category.state === 'alive'
                        ? 'border-l-[3px] border-accent'
                        : 'border-l-[3px] border-locked opacity-70'
                  }`}
                >
                  {/* State carries a glyph as well as a colour. */}
                  <span aria-hidden="true" className="pt-0.5 text-[13px]">
                    {category.state === 'confirmed' ? '✓' : category.state === 'dead' ? '✕' : '·'}
                  </span>

                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[14px]">
                      {category.label}
                      <span className="ml-2 label text-text-3">
                        {category.state === 'confirmed'
                          ? 'confirmed'
                          : category.state === 'alive'
                            ? 'alive'
                            : 'dead'}
                      </span>
                    </span>
                    <span className="text-[12.5px] text-text-3">{category.detail}</span>
                  </span>

                  <span
                    className={`shrink-0 font-num text-[16px] font-bold tabular-nums ${
                      category.points > 0 ? 'text-text' : 'text-text-3'
                    }`}
                  >
                    {category.points > 0 ? `+${category.points}` : '0'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------- timeline + picks ---------------- */}
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h2 className="label">Timeline</h2>
            {match.events.length === 0 ? (
              <p className="text-[13px] text-text-3">Nothing has happened yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {match.events.map((event, index) => (
                  <li key={index} className="flex items-baseline gap-3 py-2">
                    <span className="w-9 shrink-0 font-num text-[12px] tabular-nums text-text-3">
                      {event.minute != null ? `${event.minute}'` : '—'}
                    </span>
                    <span className="flex-1 text-[13px]">
                      {eventLabel(event.type)}
                      {event.playerName ? ` — ${event.playerName}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="label">League picks</h2>
            {match.leaguePicks.length <= 1 ? (
              <p className="text-[13px] text-text-3">
                Other picks appear once the match locks and your league&apos;s reveal
                setting allows it.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {match.leaguePicks.map((pick) => (
                  <li
                    key={pick.username}
                    className={`flex items-center gap-3 py-2 ${pick.isYou ? 'border-l-[3px] border-accent pl-2' : 'pl-2'}`}
                  >
                    <span className="flex-1 truncate text-[13px]">
                      {pick.username}
                      {pick.isYou ? <span className="ml-2 label text-accent">You</span> : null}
                    </span>
                    <span className="font-num text-[13px] tabular-nums text-text-2">
                      {pick.home}:{pick.away}
                    </span>
                    <span className="w-10 text-right font-num text-[13px] font-bold tabular-nums">
                      +{pick.points}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function eventLabel(type: string): string {
  switch (type) {
    case 'goal':
      return 'Goal';
    case 'own_goal':
      return 'Own goal';
    case 'penalty_goal':
      return 'Penalty scored';
    case 'missed_penalty':
      return 'Penalty missed';
    case 'yellow':
      return 'Booked';
    case 'red':
      return 'Sent off';
    case 'substitution':
      return 'Substitution';
    case 'var':
      return 'VAR check';
    default:
      return type;
  }
}
