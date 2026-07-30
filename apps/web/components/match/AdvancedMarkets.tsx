'use client';

import type { FixtureMarketPrediction, PredictFixture } from '../../lib/predictions';

import { SquadSearch } from './SquadSearch';

/**
 * The advanced-market sheet: the hedges plus the two "first goal" markets.
 *
 * Every hedge defaults to null, meaning "derive it from my scoreline". That is the old
 * app's semantics and it matters: a user who has not touched goal difference is claiming
 * whatever their scoreline implies, and a user who HAS touched it is making a separate,
 * independently scored claim. So each control has an explicit "from scoreline" option
 * rather than treating the derived value as if it had been chosen.
 */
export function AdvancedMarkets({
  fixture,
  onChange,
}: {
  fixture: PredictFixture;
  onChange: (next: FixtureMarketPrediction) => void;
}) {
  const p = fixture.prediction;
  const score = p.score ?? { home: 0, away: 0 };
  const derived = {
    goalDiff: score.home - score.away,
    totalGoals: score.home + score.away,
    btts: score.home > 0 && score.away > 0,
  };

  const patch = (partial: Partial<FixtureMarketPrediction>) => onChange({ ...p, ...partial });

  return (
    <div className="flex flex-col gap-5">
      <Hedge
        label="Goal difference"
        derivedLabel={`From scoreline (${derived.goalDiff > 0 ? '+' : ''}${derived.goalDiff})`}
        overridden={p.goalDiff != null}
        onClear={() => patch({ goalDiff: null })}
      >
        <NumberInput
          label="Goal difference"
          value={p.goalDiff ?? derived.goalDiff}
          min={-99}
          onChange={(goalDiff) => patch({ goalDiff })}
        />
      </Hedge>

      <Hedge
        label="Total goals"
        derivedLabel={`From scoreline (${derived.totalGoals})`}
        overridden={p.totalGoals != null}
        onClear={() => patch({ totalGoals: null })}
      >
        <NumberInput
          label="Total goals"
          value={p.totalGoals ?? derived.totalGoals}
          min={0}
          onChange={(totalGoals) => patch({ totalGoals })}
        />
      </Hedge>

      <Hedge
        label="Both teams to score"
        derivedLabel={`From scoreline (${derived.btts ? 'yes' : 'no'})`}
        overridden={p.btts != null}
        onClear={() => patch({ btts: null })}
      >
        <div className="flex gap-2">
          <Choice selected={p.btts === true} onClick={() => patch({ btts: true })}>
            Yes
          </Choice>
          <Choice selected={p.btts === false} onClick={() => patch({ btts: false })}>
            No
          </Choice>
        </div>
      </Hedge>

      <fieldset className="flex flex-col gap-2">
        <legend className="label pb-2">First goal</legend>
        <div className="flex flex-wrap gap-2">
          <Choice
            selected={p.firstScoringTeam.teamId === fixture.home.id}
            onClick={() =>
              patch({ firstScoringTeam: { teamId: fixture.home.id, none: false } })
            }
          >
            {fixture.home.name}
          </Choice>
          <Choice
            selected={p.firstScoringTeam.teamId === fixture.away.id}
            onClick={() =>
              patch({ firstScoringTeam: { teamId: fixture.away.id, none: false } })
            }
          >
            {fixture.away.name}
          </Choice>
          {/* A real, scoreable answer — correct in exactly one match: a goalless one. */}
          <Choice
            selected={p.firstScoringTeam.none}
            onClick={() => patch({ firstScoringTeam: { teamId: null, none: true } })}
          >
            No goals
          </Choice>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="label pb-2">First scorer</legend>
        <p className="text-[12.5px] text-text-3">
          Own goals never count as a first scorer.
        </p>
        <div className="flex flex-wrap gap-2">
          <Choice
            selected={p.firstGoalscorer.none}
            onClick={() =>
              patch({ firstGoalscorer: { playerId: null, none: !p.firstGoalscorer.none } })
            }
          >
            No scorer
          </Choice>
        </div>
        {/* Hidden rather than disabled while "no scorer" is chosen: the two are mutually
            exclusive answers to one question, and a visible dead control invites a tap
            that does nothing. */}
        {!p.firstGoalscorer.none ? (
          <SquadSearch
            fixtureId={fixture.id}
            homeName={fixture.home.name}
            awayName={fixture.away.name}
            selectedPlayerId={p.firstGoalscorer.playerId}
            onSelect={(playerId) => patch({ firstGoalscorer: { playerId, none: false } })}
          />
        ) : null}
      </fieldset>
    </div>
  );
}

function Hedge({
  label,
  derivedLabel,
  overridden,
  onClear,
  children,
}: {
  label: string;
  derivedLabel: string;
  overridden: boolean;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="label">{label}</span>
        <button
          type="button"
          onClick={onClear}
          disabled={!overridden}
          className="min-h-tap text-[12.5px] text-text-3 underline-offset-4 hover:text-text-2 hover:underline disabled:no-underline disabled:opacity-60"
        >
          {overridden ? 'Use scoreline' : derivedLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

function NumberInput({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (next: number) => void;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      value={value}
      min={min}
      max={99}
      onChange={(event) => onChange(Number(event.target.value))}
      className="min-h-tap w-24 rounded-md bg-surface-2 px-3 font-num tabular-nums shadow-el-1"
    />
  );
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-tap rounded-md px-4 text-[13px] ${
        // Volt marks the user's choice. aria-pressed carries it for anyone who cannot
        // see the fill.
        selected ? 'bg-accent text-on-accent' : 'bg-surface-2 text-text-2 hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}
