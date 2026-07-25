-- pg_cron -> pg_net -> /api/jobs/tick (D3, addendum §F).
--
-- The schedule lives in Postgres rather than Vercel Cron for two reasons: Hobby cron is
-- limited to once daily, and the tick needs minute resolution during a matchday.
--
-- The ~4h active-CPU/month cap on Hobby is the constraint that shapes this. The "is there
-- anything due?" question is answered in SQL, and the HTTP call only happens when the
-- answer is yes — an idle Tuesday costs a few index probes a minute and no function
-- invocations at all.
--
-- Extensions are created here but the schedule itself is NOT: it needs the deployed URL
-- and the CRON_SECRET, which are environment-specific. Run schedule_matchday_tick() once
-- per environment, from the SQL editor. Instructions in docs/plan/scheduler-setup.md.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Is there anything worth waking the app for?
--
-- True when: a market is due to lock, a fixture is in play or about to be, a finished
-- fixture is still unsettled, or a league round is inside its fallback window.
-- ---------------------------------------------------------------------------
create or replace function public.tick_has_work()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- Markets past their lock that the sweep has not caught yet.
    exists (select 1 from public.markets
             where status = 'open' and locks_at <= now())
    -- Anything in play, or kicking off within the poll window.
    or exists (select 1 from public.fixtures
                where status in ('lineups', 'live', 'ht')
                   or (status = 'scheduled'
                       and kickoff_at between now() - interval '15 minutes'
                                          and now() + interval '15 minutes'))
    -- Finished but unsettled: the settlement run still owes someone their points.
    or exists (select 1 from public.fixtures f
                where f.status = 'finished'
                  and exists (select 1 from public.markets m
                               where m.fixture_id = f.id and m.status <> 'settled'))
    -- A selection round inside its 24h fallback window.
    or exists (
      select 1
        from public.league_seasons ls
        join public.seasons s on s.id = ls.season_id
        join public.stages st on st.season_id = s.id
        join public.rounds r on r.stage_id = st.id
       where ls.selection_mode <> 'all'
         and ls.status = 'active'
         and (select min(f.kickoff_at) from public.fixtures f where f.round_id = r.id)
               between now() and now() + interval '24 hours'
         and not exists (select 1 from public.league_round_selections sel
                          where sel.league_season_id = ls.id
                            and sel.round_id = r.id
                            and sel.finalized_at is not null));
$$;

comment on function public.tick_has_work() is
  'SQL-side gate for the tick. Keeps an idle day off Vercel''s active-CPU budget entirely.';

-- ---------------------------------------------------------------------------
-- Installs the every-minute schedule. Environment-specific, so it is a function to call
-- rather than something this migration does.
-- ---------------------------------------------------------------------------
create or replace function public.schedule_matchday_tick(
  p_site_url text,
  p_cron_secret text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp, extensions
as $$
begin
  -- Replace rather than duplicate when re-run against a rotated secret or a new URL.
  perform cron.unschedule('matchday-tick')
   where exists (select 1 from cron.job where jobname = 'matchday-tick');

  perform cron.schedule(
    'matchday-tick',
    '* * * * *',
    format(
      $job$
      select case when public.tick_has_work() then
        net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', %L),
          body := '{}'::jsonb,
          timeout_milliseconds := 20000)
      end;
      $job$,
      p_site_url || '/api/jobs/tick',
      'Bearer ' || p_cron_secret));
end;
$$;

revoke all on function public.schedule_matchday_tick(text, text) from public, anon, authenticated;

comment on function public.schedule_matchday_tick(text, text) is
  'Run once per environment from the SQL editor. Idempotent — re-running replaces the schedule.';
