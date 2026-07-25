'use client';

import { useState } from 'react';

import type { PredictFixture } from '../../lib/predictions';
import { CountdownChip } from './CountdownChip';
import { CountsBadge } from './CountsBadge';
import { ScoreStepper } from './ScoreStepper';
import { StateBadge } from './StateBadge';
import { TeamChip } from './TeamChip';

/**
 * Fixture prediction card — recreated from design/screens/Predict v2.dc.html and
 * design/components/FixtureCard.prompt.md.
 *
 * Anatomy, top to bottom: kickoff + state badge; two team rows with steppers (editable)
 * or picks (locked onward) plus the real score once live; advanced-market summary and
 * expander.
 *
 * All five states render here: editable, locked, live, settled, void. The card takes its
 * state from the server (which took it from the database), never from comparing kickoff
 * to the browser clock.
 */

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'locked'; message: string }
  | { kind: 'error'; message: string };

const RAIL: Record<PredictFixture['presentation'], string> = {
  // A 3px left rail in the state colour, so state is never carried by fill alone.
  editable: 'border-l-[3px] border-accent',
  locked: 'border-l-[3px] border-locked',
  live: 'border-l-[3px] border-live',
  settled: 'border-l-[3px] border-success',
  void: 'border-l-[3px] border-dashed border-void opacity-[.55]',
};

export function FixtureCard({
  fixture,
  onChange,
  saveState,
  children,
}: {
  fixture: PredictFixture;
  onChange?: (next: { home: number; away: number }) => void;
  saveState?: SaveState;
  /** Advanced-market sheet, rendered when expanded. */
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const { presentation: state, prediction } = fixture;
  const editable = state === 'editable';
  const showActual = state === 'live' || state === 'settled';

  return (
    <article
      className={`flex flex-col gap-3 rounded-md bg-surface px-4 py-4 shadow-el-1 ${RAIL[state]}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-baseline gap-2">
          <span className="font-num text-[12px] tabular-nums text-text-2">
            {formatKickoff(fixture.kickoffAt)}
          </span>
          <CountsBadge countsIn={fixture.countsIn} />
        </span>

        <span className="flex items-center gap-2">
          {state === 'editable' ? (
            <CountdownChip target={fixture.kickoffAt} />
          ) : (
            <StateBadge state={state === 'void' ? 'void' : state === 'live' ? 'live' : state === 'settled' ? 'settled' : 'locked'}>
              {state === 'live' && fixture.minute != null ? `Live · ${fixture.minute}'` : undefined}
              {state === 'void' ? statusLabel(fixture.status) : undefined}
            </StateBadge>
          )}
        </span>
      </header>

      <div className="flex flex-col gap-2">
        <TeamRow
          team={fixture.home}
          value={prediction.score?.home ?? null}
          actual={showActual ? fixture.homeScore : null}
          editable={editable}
          onChange={(home) => onChange?.({ home, away: prediction.score?.away ?? 0 })}
        />
        <TeamRow
          team={fixture.away}
          value={prediction.score?.away ?? null}
          actual={showActual ? fixture.awayScore : null}
          editable={editable}
          onChange={(away) => onChange?.({ home: prediction.score?.home ?? 0, away })}
        />
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] text-text-3">{summarise(prediction)}</span>

        <span className="flex items-center gap-3">
          <SaveIndicator state={saveState} />
          {editable ? (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              className="min-h-tap font-display text-[11px] font-bold uppercase tracking-label text-text-2 hover:text-text"
            >
              {expanded ? 'Fewer markets' : 'More markets'}
            </button>
          ) : null}
        </span>
      </footer>

      {expanded && editable ? <div className="border-t border-border pt-3">{children}</div> : null}
    </article>
  );
}

function TeamRow({
  team,
  value,
  actual,
  editable,
  onChange,
}: {
  team: { name: string; code: string | null };
  value: number | null;
  actual: number | null;
  editable: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex min-h-tap items-center gap-3">
      <TeamChip code={team.code} name={team.name} />
      <span className="flex-1 truncate text-[14px]" title={team.name}>
        {team.name}
      </span>

      {actual != null ? (
        <span className="flex items-baseline gap-3">
          <span className="font-num text-[14px] tabular-nums text-text-3" title="Your pick">
            {value ?? '–'}
          </span>
          <span className="font-num text-[24px] font-bold tabular-nums">{actual}</span>
        </span>
      ) : (
        <ScoreStepper
          value={value}
          label={`${team.name} goals`}
          disabled={!editable}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state?: SaveState }) {
  if (!state || state.kind === 'idle') return null;

  if (state.kind === 'saving') {
    return (
      <span role="status" className="text-[12.5px] text-text-3">
        Saving…
      </span>
    );
  }

  if (state.kind === 'saved') {
    return (
      <span role="status" className="text-[12.5px] text-success">
        ✓ Saved
      </span>
    );
  }

  // The lock conflict is its own state, not a generic error: the user needs to know
  // their earlier pick still stands (design/README.md, Interactions).
  return (
    <span role="alert" className="text-[12.5px] text-danger">
      {state.message}
    </span>
  );
}

function summarise(prediction: PredictFixture['prediction']): string {
  if (!prediction.score) return 'No prediction yet';

  const parts: string[] = [];
  if (prediction.goalDiff != null) {
    parts.push(`GD ${prediction.goalDiff > 0 ? '+' : ''}${prediction.goalDiff}`);
  }
  if (prediction.totalGoals != null) parts.push(`TG ${prediction.totalGoals}`);
  if (prediction.btts != null) parts.push(`BTTS ${prediction.btts ? 'yes' : 'no'}`);
  if (prediction.firstGoalscorer.none) parts.push('No scorer');
  else if (prediction.firstGoalscorer.playerId) parts.push('Scorer picked');
  if (prediction.firstScoringTeam.none) parts.push('No first goal');
  else if (prediction.firstScoringTeam.teamId) parts.push('First goal picked');

  return parts.length > 0 ? parts.join(' · ') : 'Scoreline only';
}

function statusLabel(status: string): string {
  switch (status) {
    case 'postponed':
      return 'Postponed';
    case 'abandoned':
      return 'Abandoned';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Void';
  }
}

function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
