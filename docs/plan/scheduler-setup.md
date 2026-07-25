# Scheduler setup (once per environment)

The tick schedule lives in Postgres, not Vercel Cron: Hobby cron is limited to once daily
and a matchday needs minute resolution (D3, addendum §F).

`20260725180000_scheduler.sql` installs `pg_cron` and `pg_net` and defines the functions,
but does **not** create the schedule — that needs the deployed URL and the `CRON_SECRET`,
which differ per environment and must not live in a migration.

## Steps

1. Set `CRON_SECRET` in the Vercel project (Production and Preview), and deploy.
2. In the Supabase SQL editor for that project, run:

   ```sql
   select public.schedule_matchday_tick(
     'https://your-deployment.vercel.app',
     'the-same-CRON_SECRET-value'
   );
   ```

3. Confirm it registered:

   ```sql
   select jobname, schedule, active from cron.job where jobname = 'matchday-tick';
   ```

Re-running step 2 replaces the schedule, so it is also how you rotate the secret or point
at a new URL.

## What it does

Every minute, `tick_has_work()` is evaluated **in SQL**. The HTTP call only happens when
it returns true, so an idle Tuesday costs a few index probes a minute and no Vercel
function invocations at all. That is what keeps the deployment inside Hobby's ~4h
active-CPU/month cap.

It returns true when:

- a market is past `locks_at` and the sweep has not caught it,
- a fixture is in play, or kicks off within ±15 minutes,
- a finished fixture still has unsettled markets,
- a league round is inside its 24h selection-fallback window.

## Verifying

```bash
# Should be 401 without the secret, 405 on GET, and JSON with the correct secret.
curl -i -X POST https://your-deployment.vercel.app/api/jobs/tick
curl -i -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://your-deployment.vercel.app/api/jobs/tick
```

Both were verified locally against the real route before this shipped.

## If the tick stops

`sync_runs` is the first place to look — a row stuck in `running` means a job died
mid-flight. `select * from cron.job_run_details order by start_time desc limit 20;` shows
whether pg_cron is firing at all, which distinguishes "the schedule is gone" from "the
endpoint is failing".
