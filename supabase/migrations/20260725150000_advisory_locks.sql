-- Advisory lock helpers for the jobs package.
--
-- Exposed as functions because PostgREST cannot call pg_try_advisory_lock directly, and
-- because naming them makes the intent legible in a stack trace.
--
-- Service role only: a client that could take a job lock could stall settlement.

set check_function_bodies = off;

create or replace function public.try_advisory_lock(p_key bigint)
returns boolean
language sql
volatile
set search_path = public, pg_temp
as $$
  select pg_try_advisory_lock(p_key);
$$;

create or replace function public.release_advisory_lock(p_key bigint)
returns boolean
language sql
volatile
set search_path = public, pg_temp
as $$
  select pg_advisory_unlock(p_key);
$$;

revoke all on function public.try_advisory_lock(bigint) from public, anon, authenticated;
revoke all on function public.release_advisory_lock(bigint) from public, anon, authenticated;
grant execute on function public.try_advisory_lock(bigint) to service_role;
grant execute on function public.release_advisory_lock(bigint) to service_role;

comment on function public.try_advisory_lock(bigint) is
  'Session-scoped job lock. Held for the life of the connection, so a crashed job cannot wedge a scope.';
