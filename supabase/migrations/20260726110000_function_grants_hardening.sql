-- Function EXECUTE privileges for every client role.
--
-- 20260725200000_explicit_grants.sql did this for tables and stopped there, on the
-- assumption that `revoke all on function ... from public` next to each definition was
-- enough. On a hosted project it is not.
--
-- Supabase ships default privileges that GRANT EXECUTE to anon, authenticated and
-- service_role on every function created in `public`. That is a grant to those roles
-- *directly*, not via PUBLIC, so revoking from PUBLIC leaves it completely intact. The
-- hosted linter is what surfaced it: 36 SECURITY DEFINER functions — create_league,
-- join_league, upsert_prize_scheme, remove_member — reachable by a signed-out caller at
-- /rest/v1/rpc/<name> with nothing but the publishable key.
--
-- Most would have failed anyway, because their first act is an auth.uid()-based
-- authorization check that returns null for anon. "Fails for a second reason" is not an
-- access control decision, though, and it is one refactor away from being wrong.
--
-- Same shape as the table-grants bug: a platform default that used to be safe, changed
-- underneath us, invisible on a local stack. Both halves of the privilege surface are now
-- stated in the repository rather than inherited.

-- ---------------------------------------------------------------------------
-- anon: nothing at all.
--
-- Every route outside PUBLIC_PREFIXES (see apps/web/lib/supabase/middleware.ts) requires
-- a session, /join included — so the signed-out visitor calls no RPC. The earlier comment
-- in the table-grants migration claiming preview_league was needed by anon was wrong:
-- the join page is inside the authenticated (app) group.
-- ---------------------------------------------------------------------------
revoke execute on all routines in schema public from anon;
revoke execute on all routines in schema public from public;

-- ---------------------------------------------------------------------------
-- authenticated: drop what only jobs, triggers and the service role ever call.
--
-- Trigger functions do not need to be callable to fire — Postgres checks EXECUTE when the
-- trigger is created, not when it runs — so revoking these disables the RPC endpoint
-- without touching enforcement. ensure_*_markets and lock_markets_sweep are invoked with
-- the service client (packages/jobs, ops/actions.ts), never the user's.
--
-- can_view_prediction stays: the predictions policy calls it, and a policy expression is
-- evaluated with the querying role's privileges.
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    -- trigger functions
    'handle_new_user', 'enforce_prediction_lock', 'enforce_vote_window',
    'record_prediction_revision', 'reject_prediction_delete', 'set_updated_at',
    'reject_mutation',
    -- internal helpers and job entry points
    'generate_join_code', 'lock_markets_sweep', 'tick_has_work',
    'ensure_fixture_markets', 'ensure_season_markets'
  ]
  loop
    execute (
      select coalesce(string_agg(
        format('revoke execute on function public.%I(%s) from anon, authenticated;',
               p.proname, pg_get_function_identity_arguments(p.oid)), ' '), '')
        from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = fn
    );
  end loop;
end;
$$;

-- service_role keeps everything: the tick, settlement and bootstrap run as it.
grant execute on all routines in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Pin the two search paths the linter flagged.
--
-- Both are trigger functions owned by postgres. A mutable search_path on a function that
-- runs on someone else's INSERT is the standard shadowing route, even without SECURITY
-- DEFINER: a temp table named like a real one changes what the body resolves to.
-- ---------------------------------------------------------------------------
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.reject_mutation() set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- Views, which the table-grants migration missed.
--
-- Its revoke loop read pg_tables, and pg_tables excludes views — so league_vote_tallies
-- stayed anon-readable. It is deliberately a definer-rights view (security_invoker = false)
-- so that the caller's own RLS does not filter the tally down to their single vote, which
-- means it is the one relation in the schema that answers without consulting the reader's
-- policies. Its WHERE clause gates on is_league_season_member(), so anon already got zero
-- rows, but a definer view reachable by a signed-out caller is the exact shape of the
-- linter's security_definer_view error and does not need to be reachable at all.
-- ---------------------------------------------------------------------------
revoke all on public.league_vote_tallies from anon;

-- ---------------------------------------------------------------------------
-- Future functions inherit nothing either. Without this, the very next migration
-- reintroduces the whole problem silently.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;
