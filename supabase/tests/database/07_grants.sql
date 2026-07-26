-- Privileges, as distinct from policies.
--
-- RLS decides which rows a role sees. GRANTs decide whether the role may attempt the verb
-- at all, and the two have failed independently twice now — both times because a Supabase
-- platform default changed and the schema was silently relying on it:
--
--   1. New tables stopped arriving with ALL granted to anon/authenticated, so every client
--      query 42501'd on a fresh hosted project (fixed in 20260725200000).
--   2. New functions still arrive with EXECUTE granted directly to anon, so `revoke all
--      from public` next to each definition left 36 SECURITY DEFINER functions callable by
--      a signed-out request (fixed in 20260726110000).
--
-- Neither was visible from reading the migrations, because the grant came from outside
-- them. These assertions state the intended privilege surface directly, so the third
-- variation fails here rather than in production.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- ---------------------------------------------------------------------------
-- anon reaches nothing. Every route requiring data is behind a session
-- (apps/web/lib/supabase/middleware.ts), so the signed-out surface is zero.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'anon can execute no function in public');

select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
      and has_table_privilege('anon', c.oid, 'select')),
  0,
  'anon can select from no table or view in public — views included, which the first fix missed');

-- ---------------------------------------------------------------------------
-- authenticated keeps exactly what the app calls. A revoke that goes too far is as
-- much a broken app as one that goes not far enough, and fails just as invisibly.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from (values
    ('create_league'), ('join_league'), ('leave_league'), ('preview_league'),
    ('league_join_code'), ('regenerate_join_code'), ('enrol_league_season'),
    ('update_league_season_settings'), ('save_fixture_prediction'),
    ('save_season_table_prediction'), ('save_golden_boot_prediction'),
    ('toggle_fixture_vote'), ('finalize_round_selection'), ('round_selection_state'),
    ('league_round_fixtures'), ('league_weights'), ('league_score_components'),
    ('current_table_order'), ('table_race_entries'), ('can_view_prediction'),
    ('is_league_member'), ('is_league_organizer'), ('is_league_season_member'),
    ('is_league_season_organizer'), ('is_platform_admin'), ('create_rule_set_version'),
    ('upsert_prize_scheme'), ('clear_prize_scheme'), ('set_member_role'),
    ('remove_member'), ('head_to_head')
  ) as needed(fn)
  where not exists (
    select 1 from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = needed.fn
       and has_function_privilege('authenticated', p.oid, 'execute'))),
  0,
  'authenticated retains execute on every function the app actually calls');

-- Trigger functions and job entry points are not an API. Revoking these closes the
-- /rest/v1/rpc endpoint without weakening enforcement: Postgres checks EXECUTE when a
-- trigger is created, not each time it fires.
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'handle_new_user', 'enforce_prediction_lock', 'enforce_vote_window',
        'record_prediction_revision', 'reject_prediction_delete', 'set_updated_at',
        'reject_mutation', 'generate_join_code', 'lock_markets_sweep', 'tick_has_work',
        'ensure_fixture_markets', 'ensure_season_markets')
      and has_function_privilege('authenticated', p.oid, 'execute')),
  0,
  'trigger functions and job entry points are not callable over the API');

-- ---------------------------------------------------------------------------
-- service_role is the backend. It bypasses RLS but NOT grants — the tick, settlement
-- and bootstrap all fail with 42501 without these, exactly as clients did.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not has_function_privilege('service_role', p.oid, 'execute')),
  0,
  'service_role can execute every function in public');

-- Relations are matched by oid rather than by a formatted name: has_table_privilege() is
-- not guaranteed to be evaluated after the schemaname filter, so the name form can be
-- handed a system catalog and error out before the predicate ever applies.
select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not has_table_privilege('service_role', c.oid, 'insert')),
  0,
  'service_role can write to every table in public');

-- ---------------------------------------------------------------------------
-- The tables holding provider responses and internal bookkeeping are unreachable by
-- permission, not merely empty by policy (§10.2). A hard 42501 beats a policy-dependent
-- empty result for anything storing verbatim upstream payloads.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in (
        'raw_payloads', 'sync_runs', 'provider_quota_ledger', 'job_state',
        'admin_audit_log', 'provider_entity_map', 'rate_limits')
      and has_table_privilege('authenticated', c.oid, 'select')),
  0,
  'authenticated cannot read provider payloads or internal bookkeeping');

-- ---------------------------------------------------------------------------
-- Nothing in public may resolve names ambiguously. A mutable search_path on a function
-- that runs during someone else's INSERT is the standard shadowing route.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and (p.proconfig is null
           or not exists (select 1 from unnest(p.proconfig) as c
                           where c like 'search_path=%'))),
  0,
  'every function in public pins its search_path');

select * from finish();
rollback;
