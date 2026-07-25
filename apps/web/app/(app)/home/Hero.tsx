import Link from 'next/link';

import { HeroCountdown } from '../../../components/match/HeroCountdown';
import { StateBadge } from '../../../components/match/StateBadge';
import { TeamChip } from '../../../components/match/TeamChip';
import type { HomeState } from '../../../lib/home';

/**
 * Adaptive matchweek hero — design/screens/Home v2.dc.html, four phases.
 *
 * Full-bleed band with a radial tint per phase (design/README.md, Surface hierarchy):
 * volt before the deadline, live-coral in play, green when settled, neutral when quiet.
 * The hero is not a card — cards are for interactive and stateful things, and this is a
 * band. Only the CTA inside it earns a border.
 *
 * The phase arrives from the server, derived from matchweek state. Nothing here reads a
 * clock to decide what to show; the countdown is the only live element and it only ever
 * counts down.
 */

/** Radial tints from the design's surface hierarchy, as token-derived CSS vars. */
const TINT: Record<HomeState['phase'], string> = {
  'pre-deadline': 'var(--accent-dim)',
  live: 'var(--live-dim)',
  settled: 'var(--success-dim)',
  quiet: 'transparent',
};

export function Hero({ state }: { state: HomeState }) {
  return (
    <section
      className="hero-band -mx-4 px-4 py-8"
      style={{ ['--hero-tint' as string]: TINT[state.phase] }}
    >
      {state.phase === 'live' && state.live ? <LivePhase state={state} /> : null}
      {state.phase === 'pre-deadline' ? <PreDeadlinePhase state={state} /> : null}
      {state.phase === 'settled' ? <SettledPhase state={state} /> : null}
      {state.phase === 'quiet' ? <QuietPhase state={state} /> : null}
    </section>
  );
}

function PreDeadlinePhase({ state }: { state: HomeState }) {
  const remaining = state.total - state.predicted;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="flex items-center gap-3 font-display text-[40px] font-black uppercase leading-none">
          <span aria-hidden="true" className="h-8 w-1 rounded-full bg-accent" />
          {state.roundName ?? 'Matchweek'}
        </h1>
        {state.firstLockFixture && state.nextLockAt ? (
          <p className="flex items-start gap-3 text-text-2">
            <span aria-hidden="true" className="mt-1 h-5 w-1 rounded-full bg-live" />
            First kickoff {formatKickoff(state.nextLockAt)} — {state.firstLockFixture} locks
            first
          </p>
        ) : null}
      </div>

      {state.nextLockAt ? <HeroCountdown target={state.nextLockAt} /> : null}

      <ProgressTrack done={state.predicted} total={state.total} />

      <p className="text-[13px] text-text-2">
        <span className="font-num tabular-nums">{state.predicted}</span> of{' '}
        <span className="font-num tabular-nums">{state.total}</span> predicted · saved
        automatically, editable until each kickoff
      </p>

      <Link
        href="/predict"
        className="inline-flex min-h-tap items-center justify-center rounded-md bg-accent px-6 font-display text-[14px] font-extrabold uppercase tracking-label text-on-accent"
      >
        {remaining > 0 ? `Predict remaining ${remaining} →` : 'Review your picks →'}
      </Link>
    </div>
  );
}

function LivePhase({ state }: { state: HomeState }) {
  const live = state.live!;

  return (
    <div className="flex flex-col gap-4">
      <StateBadge state="live">
        {live.minute != null ? `Live · ${live.minute}'` : 'Live'}
      </StateBadge>

      <div className="flex items-center gap-4">
        <TeamChip code={live.homeCode} name={live.home} size={36} />
        <span className="flex-1 truncate font-display text-[16px] font-bold">{live.home}</span>
        <span className="font-num text-[48px] font-bold leading-none tabular-nums">
          {live.homeScore}<span className="px-1 text-text-3">:</span>{live.awayScore}
        </span>
        <span className="flex-1 truncate text-right font-display text-[16px] font-bold">
          {live.away}
        </span>
        <TeamChip code={live.awayCode} name={live.away} size={36} />
      </div>

      <p className="text-[13px] text-text-2">
        Provisional points update as it plays. Nothing settles until full time.
      </p>

      <Link
        href="/predict"
        className="inline-flex min-h-tap items-center justify-center rounded-md bg-surface-2 px-6 font-display text-[13px] font-extrabold uppercase tracking-label text-text shadow-el-1"
      >
        See your matchweek →
      </Link>
    </div>
  );
}

function SettledPhase({ state }: { state: HomeState }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="label">Last time out</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">
          {state.roundName ?? 'Matchweek'} is settled.
        </h1>
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {state.recent.map((result) => (
          <li key={result.fixtureId} className="flex items-center gap-3 py-3">
            <TeamChip code={result.homeCode} name={result.home} size={24} />
            <span className="flex-1 truncate text-[13px]">
              {result.home} v {result.away}
            </span>
            <span className="font-num text-[16px] font-bold tabular-nums">
              {result.homeScore}:{result.awayScore}
            </span>
            {result.exact ? (
              // The graded celebration: an exact score gets a badge and one pulse.
              // Ordinary points get nothing at all.
              <span className="called-it label rounded-sm bg-accent px-2 py-1 text-on-accent">
                Called it
              </span>
            ) : result.predictedHome != null ? (
              <span className="font-num text-[12px] tabular-nums text-text-3">
                you {result.predictedHome}:{result.predictedAway}
              </span>
            ) : (
              <span className="label text-text-3">No pick</span>
            )}
          </li>
        ))}
      </ul>

      <Link
        href="/leagues"
        className="inline-flex min-h-tap items-center justify-center rounded-md bg-accent px-6 font-display text-[14px] font-extrabold uppercase tracking-label text-on-accent"
      >
        Review matchweek →
      </Link>
    </div>
  );
}

function QuietPhase({ state }: { state: HomeState }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="label">Quiet week</p>
      <h1 className="font-display text-[28px] font-extrabold leading-tight">
        {state.nextRoundAt ? 'Nothing to predict yet.' : 'No fixtures loaded yet.'}
      </h1>
      <p className="max-w-prose text-text-2">
        {state.nextRoundAt
          ? 'The next matchweek opens once its fixtures are confirmed. Good time to check your season table.'
          : 'Once the season is imported, your matchweek appears here.'}
      </p>

      <Link
        href="/table"
        className="inline-flex min-h-tap items-center justify-center rounded-md bg-surface-2 px-6 font-display text-[13px] font-extrabold uppercase tracking-label text-text shadow-el-1"
      >
        Season table →
      </Link>
    </div>
  );
}

/** Ten-block progress track from the design hero. */
function ProgressTrack({ done, total }: { done: number; total: number }) {
  const blocks = Math.max(total, 1);

  return (
    <div
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label="Fixtures predicted"
      className="flex gap-1"
    >
      {Array.from({ length: blocks }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full ${i < done ? 'bg-accent' : 'bg-surface-3'}`}
        />
      ))}
    </div>
  );
}

function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
