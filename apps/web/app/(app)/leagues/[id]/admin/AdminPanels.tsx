'use client';

import { useActionState, useState } from 'react';

import { SCORE_CATEGORIES } from '@matchday/domain';

import { Button } from '../../../../../components/ui/Button';
import { Field } from '../../../../../components/ui/Field';
import { CATEGORY_COPY } from '../../../../../lib/scoring-copy';
import {
  type AdminState,
  clearPrizes,
  savePrizeScheme,
  saveWeights,
} from './actions';

export function AdminPanels({
  leagueSeasonId,
  weights,
  nextRound,
  memberCount,
  prizesActive,
  currencyLabel,
  perRound,
  overall,
}: {
  leagueSeasonId: string;
  weights: Record<string, number>;
  nextRound: number;
  memberCount: number;
  prizesActive: boolean;
  currencyLabel: string;
  perRound: number[];
  overall: number[];
}) {
  return (
    <>
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="label">Scoring</h2>
          <p className="text-[12.5px] text-text-3">
            Editing creates a new immutable version bound from a future matchweek. History
            is never rewritten.
          </p>
        </div>
        <WeightEditor
          leagueSeasonId={leagueSeasonId}
          weights={weights}
          nextRound={nextRound}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="label">Prizes</h2>
          <p className="text-[12.5px] text-text-3">
            Optional. With no scheme this is a points-only league and no money appears
            anywhere in the app.
          </p>
        </div>
        <PrizeBuilder
          leagueSeasonId={leagueSeasonId}
          memberCount={memberCount}
          active={prizesActive}
          currencyLabel={currencyLabel}
          perRound={perRound}
          overall={overall}
        />
      </section>
    </>
  );
}

/**
 * Weight editor with a live example.
 *
 * The example is the point: "what is a 2-1 call worth" is the question an organizer is
 * actually asking, and answering it with a running total beats making them add eight
 * numbers in their head.
 */
export function WeightEditor({
  leagueSeasonId,
  weights,
  nextRound,
}: {
  leagueSeasonId: string;
  weights: Record<string, number>;
  nextRound: number;
}) {
  const [state, formAction, pending] = useActionState(saveWeights, {} as AdminState);
  const [draft, setDraft] = useState<Record<string, number>>(weights);

  // A perfect call: outcome + exact + goal diff + total goals + btts + both first-goal
  // markets. team_goals is excluded because it only pays when the exact score is missed.
  const perfect = SCORE_CATEGORIES.filter((c) => c !== 'team_goals').reduce(
    (sum, c) => sum + (draft[c] ?? 0),
    0,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="leagueSeasonId" value={leagueSeasonId} />

      <div className="flex flex-col gap-2">
        {SCORE_CATEGORIES.map((category) => (
          <label key={category} className="flex min-h-tap items-center gap-3">
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[14px]">{CATEGORY_COPY[category]?.label ?? category}</span>
              <span className="text-[12.5px] text-text-3">
                {CATEGORY_COPY[category]?.how ?? ''}
              </span>
            </span>
            <input
              type="number"
              name={`w:${category}`}
              min={0}
              max={99}
              value={draft[category] ?? 0}
              onChange={(event) =>
                setDraft((current) => ({ ...current, [category]: Number(event.target.value) }))
              }
              aria-label={`${CATEGORY_COPY[category]?.label ?? category} points`}
              className="min-h-tap w-20 rounded-md bg-surface-2 px-3 text-right font-num tabular-nums shadow-el-1"
            />
          </label>
        ))}
      </div>

      <p className="rounded-md bg-surface-2 px-4 py-3 text-[13px] text-text-2">
        A perfect call — right scoreline, right first goal, right first scorer — is worth{' '}
        <span className="font-num font-bold tabular-nums text-text">{perfect}</span> points.
        Setting a weight to 0 keeps it recorded, so you can switch it back on later without
        anything being re-scored.
      </p>

      <Field
        label="Applies from matchweek"
        name="effectiveFromRound"
        type="number"
        min={nextRound}
        defaultValue={String(nextRound)}
        hint="Rules are versioned. Past matchweeks are never re-scored, so this must be a round that hasn't been played."
      />

      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-dim px-4 py-3 text-[13px] text-danger">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p role="status" className="rounded-md bg-success-dim px-4 py-3 text-[13px] text-success">
          {state.notice}
        </p>
      ) : null}

      <Button type="submit" loading={pending}>
        Save scoring rules
      </Button>
    </form>
  );
}

/**
 * Prize builder. Zero-sum only for now: the winners' money comes from the losers, which
 * is how a friends' league actually works and needs no float.
 */
export function PrizeBuilder({
  leagueSeasonId,
  memberCount,
  active,
  currencyLabel,
  perRound,
  overall,
}: {
  leagueSeasonId: string;
  memberCount: number;
  active: boolean;
  currencyLabel: string;
  perRound: number[];
  overall: number[];
}) {
  const [state, formAction, pending] = useActionState(savePrizeScheme, {} as AdminState);
  const [clearState, clearAction] = useActionState(clearPrizes, {} as AdminState);
  const [draftRound, setDraftRound] = useState(perRound.join(', '));
  const [draftOverall, setDraftOverall] = useState(overall.join(', '));

  const sum = (input: string) =>
    input
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number)
      .reduce((a, b) => (Number.isFinite(b) ? a + b : a), 0);

  const roundSum = sum(draftRound);
  const overallSum = sum(draftOverall);
  const roundLen = draftRound.split(/[,\s]+/).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-text-2">
        MatchDay never moves money — this is a ledger among friends. Enter what each
        finishing position wins or loses, best first. The amounts must add up to zero,
        and there must be one per member.
      </p>

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="leagueSeasonId" value={leagueSeasonId} />

        <Field
          label="Currency symbol"
          name="currencyLabel"
          defaultValue={currencyLabel}
          maxLength={4}
          inputClassName="w-24"
        />

        <label className="flex flex-col gap-2">
          <span className="label">Per matchweek</span>
          <input
            name="perRound"
            value={draftRound}
            onChange={(event) => setDraftRound(event.target.value)}
            placeholder="15, 10, 5, 0, -5, -10, -15"
            className="min-h-tap rounded-md bg-surface-2 px-4 font-num shadow-el-1"
          />
          <span
            className={`text-[12.5px] ${
              roundSum === 0 ? 'text-text-3' : 'text-danger'
            }`}
          >
            {roundLen} {roundLen === 1 ? 'position' : 'positions'} · adds up to {roundSum}
            {roundSum !== 0 ? ' — must be 0' : ''}
            {roundLen !== memberCount && roundLen > 0
              ? ` · league has ${memberCount} members`
              : ''}
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="label">Overall (end of season)</span>
          <input
            name="overall"
            value={draftOverall}
            onChange={(event) => setDraftOverall(event.target.value)}
            placeholder="40, 20, 10, 0, -10, -20, -40"
            className="min-h-tap rounded-md bg-surface-2 px-4 font-num shadow-el-1"
          />
          <span className={`text-[12.5px] ${overallSum === 0 ? 'text-text-3' : 'text-danger'}`}>
            adds up to {overallSum}
            {overallSum !== 0 ? ' — must be 0' : ''}
          </span>
        </label>

        {state.error ? (
          <p role="alert" className="rounded-md bg-danger-dim px-4 py-3 text-[13px] text-danger">
            {state.error}
          </p>
        ) : null}
        {state.notice ? (
          <p role="status" className="rounded-md bg-success-dim px-4 py-3 text-[13px] text-success">
            {state.notice}
          </p>
        ) : null}

        <Button type="submit" loading={pending}>
          {active ? 'Update prize scheme' : 'Turn prizes on'}
        </Button>
      </form>

      {active ? (
        <form action={clearAction} className="flex flex-col gap-2 border-t border-border pt-5">
          <input type="hidden" name="leagueSeasonId" value={leagueSeasonId} />
          <Button variant="ghost" type="submit">
            Turn prizes off
          </Button>
          <p className="text-[12.5px] text-text-3">
            Returns the league to points-only. Every money element disappears app-wide.
          </p>
          {clearState.notice ? (
            <p role="status" className="text-[12.5px] text-success">
              {clearState.notice}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
