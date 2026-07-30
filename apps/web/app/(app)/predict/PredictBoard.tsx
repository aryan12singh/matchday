'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

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

  /**
   * The current fixtures, readable without going through a state updater.
   *
   * `update` used to do its work inside `setFixtures((current) => …)` and call `persist`
   * from in there. A state updater must be pure: React invokes it more than once — twice
   * under StrictMode, and again whenever a render is retried — and `persist` starts
   * another state update from inside it, which retries the pending one, which calls
   * `persist` again. The observed result was six saves for one tap and an optimistic value
   * that never committed, so a pick reached the database and never appeared on screen.
   */
  const fixturesRef = useRef(matchweek.fixtures);

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

        // Roll the optimistic value back to what the server still holds. The ref moves
        // with it, or the next edit would be computed from the value that was rejected.
        fixturesRef.current = fixturesRef.current.map((f) =>
          f.id === fixture.id ? fixture : f,
        );
        setFixtures(fixturesRef.current);
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
      const previous = fixturesRef.current.find((f) => f.id === id);
      if (!previous) return;

      const next = mutate(previous);
      fixturesRef.current = fixturesRef.current.map((f) => (f.id === id ? next : f));

      setFixtures(fixturesRef.current);
      // Outside the updater, so it runs exactly once per change.
      persist(previous, next);
    },
    [persist],
  );

  const visibleRef = useRef<PredictFixture[]>([]);

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

  // Kept in a ref so the key handler always sees the current list without re-binding the
  // listener on every keystroke.
  visibleRef.current = visible;

  const remaining = fixtures.filter((f) => !f.complete && f.editable).length;
  const predicted = fixtures.filter((f) => f.complete).length;

  // Desktop keyboard entry (design/README.md, Interactions). Entering ten fixtures with a
  // mouse is ten trips to a pair of small buttons; with the keyboard it is one pass.
  // Deliberately does not hijack Tab — the browser's focus order is already correct, and
  // stealing it would break the screen for anyone navigating by keyboard out of necessity
  // rather than preference.
  const [focused, setFocused] = useState(0);
  // The focus ring is meaningless until someone presses a key; showing it on a phone is
  // just an unexplained volt outline around the first card.
  const [keyboardActive, setKeyboardActive] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Never while the user is typing into an advanced-market input.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const editable = visibleRef.current.filter((f) => f.editable);
      if (editable.length === 0) return;

      if (['j', 'k', 'ArrowDown', 'ArrowUp', '+', '=', '-', '_', '[', ']'].includes(event.key)) {
        setKeyboardActive(true);
      }

      const index = Math.min(focused, editable.length - 1);
      const fixture = editable[index];
      if (!fixture) return;

      const bump = (side: 'home' | 'away', delta: 1 | -1) => {
        event.preventDefault();
        const score = fixture.prediction.score ?? { home: 0, away: 0 };
        const next = Math.max(0, Math.min(99, score[side] + delta));
        update(fixture.id, (f) => ({
          ...f,
          complete: true,
          prediction: { ...f.prediction, score: { ...score, [side]: next } },
        }));
      };

      switch (event.key) {
        case 'j':
        case 'ArrowDown':
          event.preventDefault();
          setFocused((i) => Math.min(editable.length - 1, i + 1));
          break;
        case 'k':
        case 'ArrowUp':
          event.preventDefault();
          setFocused((i) => Math.max(0, i - 1));
          break;
        // Home goals on the left pair, away on the right — mirrors the card layout.
        case '+':
        case '=':
          bump('home', 1);
          break;
        case '-':
        case '_':
          bump('home', -1);
          break;
        case ']':
          bump('away', 1);
          break;
        case '[':
          bump('away', -1);
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, update]);

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

      <p className="hidden text-[12.5px] text-text-3 sm:block">
        Keyboard: <kbd className="font-num">j</kbd>/<kbd className="font-num">k</kbd> move ·{' '}
        <kbd className="font-num">+</kbd>/<kbd className="font-num">−</kbd> home goals ·{' '}
        <kbd className="font-num">[</kbd>/<kbd className="font-num">]</kbd> away goals
      </p>

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
        <ul className="grid gap-3 xl:grid-cols-2">
          {visible.map((fixture) => (
            <li
              key={fixture.id}
              // A focus ring on the whole card, so the keyboard user can see which fixture
              // the +/− keys will hit.
              className={
                keyboardActive &&
                fixture.editable &&
                visible.filter((f) => f.editable).indexOf(fixture) === focused
                  ? 'rounded-md outline outline-2 outline-offset-2 outline-[var(--focus-ring)]'
                  : ''
              }
            >
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
