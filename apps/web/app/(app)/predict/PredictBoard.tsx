'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';

import { AdvancedMarkets } from '../../../components/match/AdvancedMarkets';
import { FixtureCard, type SaveState } from '../../../components/match/FixtureCard';
import { EmptyState } from '../../../components/ui/EmptyState';
import type { Matchweek, PredictFixture } from '../../../lib/predictions';
import { savePrediction } from './actions';

type Filter = 'incomplete' | 'all' | 'included';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'all', label: 'All' },
  { value: 'included', label: 'Counts for me' },
];

/**
 * Matchweek predict board — design/screens/Predict v2.dc.html.
 *
 * Autosave, no save button ("Saved automatically · editable until each kickoff").
 * Optimistic: the stepper moves immediately and the save reconciles, because a stepper
 * that waits for a round trip feels broken on a phone at the pub.
 *
 * On a lock conflict the optimistic value is rolled back to the server's value, and the
 * card says so. The database is the authority on what was saved; the UI never wins an
 * argument with it.
 */
export function PredictBoard({ matchweek }: { matchweek: Matchweek }) {
  const [filter, setFilter] = useState<Filter>('incomplete');
  const [fixtures, setFixtures] = useState(matchweek.fixtures);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [, startTransition] = useTransition();

  const setSaveState = useCallback((id: string, state: SaveState) => {
    setSaveStates((current) => ({ ...current, [id]: state }));
  }, []);

  const persist = useCallback(
    (fixture: PredictFixture, next: PredictFixture) => {
      setSaveState(fixture.id, { kind: 'saving' });

      startTransition(async () => {
        const result = await savePrediction({
          fixtureId: fixture.id,
          home: next.prediction.score?.home ?? 0,
          away: next.prediction.score?.away ?? 0,
          goalDiff: next.prediction.goalDiff,
          totalGoals: next.prediction.totalGoals,
          btts: next.prediction.btts,
          firstTeamId: next.prediction.firstScoringTeam.teamId,
          firstTeamNone: next.prediction.firstScoringTeam.none,
          firstScorerId: next.prediction.firstGoalscorer.playerId,
          firstScorerNone: next.prediction.firstGoalscorer.none,
        });

        if (result.status === 'saved') {
          setSaveState(fixture.id, { kind: 'saved' });
          return;
        }

        // Roll the optimistic value back to what the server still holds.
        setFixtures((current) =>
          current.map((f) => (f.id === fixture.id ? fixture : f)),
        );
        setSaveState(fixture.id, {
          kind: result.status === 'locked' ? 'locked' : 'error',
          message: result.message,
        });
      });
    },
    [setSaveState],
  );

  const update = useCallback(
    (id: string, mutate: (fixture: PredictFixture) => PredictFixture) => {
      setFixtures((current) => {
        const previous = current.find((f) => f.id === id);
        if (!previous) return current;

        const next = mutate(previous);
        persist(previous, next);
        return current.map((f) => (f.id === id ? next : f));
      });
    },
    [persist],
  );

  const visible = useMemo(() => {
    switch (filter) {
      case 'incomplete':
        return fixtures.filter((f) => !f.complete && f.editable);
      case 'included':
        return fixtures.filter((f) => f.countsIn.length > 0);
      default:
        return fixtures;
    }
  }, [fixtures, filter]);

  const remaining = fixtures.filter((f) => !f.complete && f.editable).length;
  const predicted = fixtures.filter((f) => f.complete).length;

  return (
    <div className="flex flex-col gap-5">
      <ProgressTrack total={fixtures.length} done={predicted} />

      <div role="tablist" aria-label="Filter fixtures" className="flex gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            role="tab"
            aria-selected={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={`min-h-tap rounded-md px-3 font-display text-[11px] font-bold uppercase tracking-label ${
              filter === option.value
                ? 'bg-accent text-on-accent'
                : 'bg-surface-2 text-text-2 hover:text-text'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={
            filter === 'incomplete'
              ? remaining === 0 && fixtures.length > 0
                ? 'Matchweek complete.'
                : 'Nothing left to predict.'
              : 'No fixtures here.'
          }
          body={
            filter === 'incomplete' && remaining === 0 && fixtures.length > 0
              ? 'Every fixture has a scoreline. You can still change them until each kickoff.'
              : 'Try the All tab.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((fixture) => (
            <li key={fixture.id}>
              <FixtureCard
                fixture={fixture}
                saveState={saveStates[fixture.id]}
                onChange={(score) =>
                  update(fixture.id, (f) => ({
                    ...f,
                    complete: true,
                    prediction: { ...f.prediction, score },
                  }))
                }
              >
                <AdvancedMarkets
                  fixture={fixture}
                  onChange={(prediction) =>
                    update(fixture.id, (f) => ({ ...f, prediction }))
                  }
                />
              </FixtureCard>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[12.5px] text-text-3">
        Saved automatically · editable until each kickoff.
      </p>
    </div>
  );
}

/** Ten-block progress track from the design's Home hero, reused here. */
function ProgressTrack({ total, done }: { total: number; done: number }) {
  const blocks = Math.max(total, 1);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="label">Predicted</span>
        <span className="font-num text-[14px] font-semibold tabular-nums">
          {done}/{total}
        </span>
      </div>
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
    </div>
  );
}
