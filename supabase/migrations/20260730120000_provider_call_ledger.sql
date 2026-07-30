-- Counting provider requests.
--
-- provider_quota_ledger has existed since the baseline schema and /ops has been reading it
-- since the ops board was built, but nothing ever wrote to it. The panel showed zero
-- because nothing counted, not because nothing was spent — and the tick's quota gate,
-- reading the same table, would have concluded it had the whole day's budget left no
-- matter how much it had actually used.
--
-- Incrementing has to be atomic and outside the caller's transaction semantics: every
-- provider call from every concurrent job increments the same row, and a read-modify-write
-- from the application would undercount exactly when the count matters most, which is a
-- matchday with several jobs in flight.
--
-- API-Football's own /status endpoint is the authority on the real number, but it costs a
-- request to ask and only refreshes daily, so this is the running local estimate the
-- windowing decides on.

create or replace function public.record_provider_call(
  p_provider text,
  p_plan_limit int default null
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_calls int;
begin
  insert into public.provider_quota_ledger (provider, day, calls, plan_limit)
  values (p_provider, current_date, 1, p_plan_limit)
  on conflict (provider, day) do update
    set calls = public.provider_quota_ledger.calls + 1,
        plan_limit = coalesce(excluded.plan_limit, public.provider_quota_ledger.plan_limit),
        updated_at = now()
  returning calls into v_calls;

  return v_calls;
end;
$$;

-- Jobs only. A client counting provider calls would be counting calls it cannot make, and
-- an anon caller could otherwise inflate the ledger until the tick stood down for quota —
-- a denial of service against our own ingestion.
revoke all on function public.record_provider_call(text, int) from public, anon, authenticated;
grant execute on function public.record_provider_call(text, int) to service_role;

comment on function public.record_provider_call(text, int) is
  'Atomically counts one provider request against today''s budget. Returns the new total.';
