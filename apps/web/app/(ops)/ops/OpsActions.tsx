'use client';

import { useActionState, useState } from 'react';

import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { type OpsState, rerunSettlement, runLockSweep, runSelectionFallbacks } from './actions';

/**
 * Operable actions (§4.2 screen 18) — "replace the laptop terminal".
 *
 * Deliberately a small set: the sweeps, and a targeted settlement re-run. Anything that
 * would write results by hand stays out, because a manual override needs the
 * `manual_override` flag and an audit story that this page cannot yet tell honestly.
 */
export function OpsActions() {
  const [settleState, settleAction, settling] = useActionState(rerunSettlement, {} as OpsState);
  const [sweep, setSweep] = useState<OpsState>({});
  const [fallback, setFallback] = useState<OpsState>({});

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="label">Actions</h2>
        <p className="text-[12.5px] text-text-3">
          Every action is idempotent and written to the audit log. Re-running settlement
          over unchanged inputs produces a run with zero changes, not a second set of
          points.
        </p>
      </div>

      <form action={settleAction} className="flex flex-col gap-3">
        <Field
          label="Re-run settlement for a fixture"
          name="fixtureId"
          placeholder="fixture uuid"
          inputClassName="font-num"
          hint="Use after a provider correction. Changes are written to score_run_changes as a diff."
          {...(settleState.error ? { error: settleState.error } : {})}
        />
        {settleState.notice ? (
          <p role="status" className="text-[12.5px] text-success">
            {settleState.notice}
          </p>
        ) : null}
        <Button type="submit" variant="secondary" loading={settling}>
          Re-run settlement
        </Button>
      </form>

      <div className="flex flex-wrap gap-3 border-t border-border pt-5">
        <Button variant="secondary" onClick={async () => setSweep(await runLockSweep())}>
          Run lock sweep
        </Button>
        <Button
          variant="secondary"
          onClick={async () => setFallback(await runSelectionFallbacks())}
        >
          Apply selection fallbacks
        </Button>
      </div>

      {[sweep, fallback].map((result, index) =>
        result.notice || result.error ? (
          <p
            key={index}
            role={result.error ? 'alert' : 'status'}
            className={`text-[12.5px] ${result.error ? 'text-danger' : 'text-success'}`}
          >
            {result.error ?? result.notice}
          </p>
        ) : null,
      )}
    </section>
  );
}
