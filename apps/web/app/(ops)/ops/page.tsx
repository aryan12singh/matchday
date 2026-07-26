import type { Metadata } from 'next';

import { getOpsHealth } from '../../../lib/ops';

import { OpsActions } from './OpsActions';

export const metadata: Metadata = { title: 'Ops' };

// Health is only useful if it is current.
export const dynamic = 'force-dynamic';

/**
 * /ops health board.
 *
 * Read-only. Every mutating action a platform admin might want — retrigger a sync, force
 * a settlement — has to take the same advisory locks and upsert paths as the automated
 * jobs (§10.3), and a button that half-does that is worse than no button. The numbers
 * here tell you what to run; you run it through the job routes.
 *
 * Ordered by what wakes you up: anything wrong first, inventory second.
 */
export default async function OpsPage() {
  const health = await getOpsHealth();

  const alerts: Array<{ text: string; level: 'danger' | 'warning' }> = [];
  if (health.stuckRuns > 0) {
    alerts.push({
      text: `${health.stuckRuns} sync run${health.stuckRuns === 1 ? '' : 's'} stuck in "running" for over 10 minutes — something died mid-flight.`,
      level: 'danger',
    });
  }
  if (health.counts.unsettledFinished > 0) {
    alerts.push({
      text: `${health.counts.unsettledFinished} finished fixture${health.counts.unsettledFinished === 1 ? '' : 's'} not yet settled — someone is owed points.`,
      level: 'danger',
    });
  }
  for (const day of health.quota) {
    if (day.limit && day.calls / day.limit > 0.9) {
      alerts.push({
        text: `${day.provider} quota at ${Math.round((day.calls / day.limit) * 100)}% on ${day.day}. Requests hard-stop at the cap.`,
        level: 'warning',
      });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <h1 className="font-display text-[28px] font-extrabold">Health</h1>

      <section className="flex flex-col gap-2">
        {alerts.length === 0 ? (
          <p className="rounded-md border-l-[3px] border-success bg-success-dim px-4 py-3 text-[13px] text-success">
            Nothing needs attention.
          </p>
        ) : (
          alerts.map((alert) => (
            <p
              key={alert.text}
              role="alert"
              className={`rounded-md border-l-[3px] px-4 py-3 text-[13px] ${
                alert.level === 'danger'
                  ? 'border-danger bg-danger-dim text-danger'
                  : 'border-warning bg-warning-dim text-warning'
              }`}
            >
              {alert.text}
            </p>
          ))
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Users" value={health.counts.users} />
        <Stat label="Leagues" value={health.counts.leagues} />
        <Stat label="Fixtures" value={health.counts.fixtures} />
        <Stat label="Markets" value={health.counts.markets} />
        <Stat label="Open markets" value={health.counts.openMarkets} />
        <Stat label="Predictions" value={health.counts.predictions} />
        <Stat label="Unsettled FT" value={health.counts.unsettledFinished} alert={health.counts.unsettledFinished > 0} />
        <Stat label="Stuck runs" value={health.stuckRuns} alert={health.stuckRuns > 0} />
      </section>

      <OpsActions />

      <Panel title="Provider quota">
        {health.quota.length === 0 ? (
          <Empty>No provider calls recorded yet.</Empty>
        ) : (
          <Table
            head={['Day', 'Provider', 'Calls', 'Limit']}
            rows={health.quota.map((row) => [
              row.day,
              row.provider,
              String(row.calls),
              row.limit != null ? String(row.limit) : '—',
            ])}
          />
        )}
      </Panel>

      <Panel title="Recent sync runs">
        {health.runs.length === 0 ? (
          <Empty>No sync has run yet. Expected until the provider key is in place.</Empty>
        ) : (
          <Table
            head={['Started', 'Job', 'Status', 'Written', 'Error']}
            rows={health.runs.map((run) => [
              new Date(run.startedAt).toLocaleString(),
              run.kind,
              run.status,
              String(run.recordsWritten),
              run.error ?? '—',
            ])}
          />
        )}
      </Panel>

      <Panel title="Recent score runs">
        {health.scoreRuns.length === 0 ? (
          <Empty>Nothing has settled yet.</Empty>
        ) : (
          <Table
            head={['Started', 'Trigger', 'Status', 'Changed']}
            rows={health.scoreRuns.map((run) => [
              new Date(run.startedAt).toLocaleString(),
              run.trigger,
              run.status,
              String(run.changed),
            ])}
          />
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface px-4 py-3 shadow-el-1">
      <span
        className={`font-num text-[24px] font-bold tabular-nums ${alert ? 'text-danger' : ''}`}
      >
        {value}
      </span>
      <span className="label text-text-3">{label}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="label">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-text-3">{children}</p>;
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    // Wide tables scroll inside their own container rather than making the page scroll.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            {head.map((cell) => (
              <th key={cell} className="label py-2 pr-4 font-normal">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`py-2 pr-4 text-[13px] ${j >= 2 ? 'font-num tabular-nums' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
