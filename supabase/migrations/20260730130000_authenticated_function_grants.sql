-- Explicit EXECUTE grants for `authenticated`.
--
-- 20260726110000_function_grants_hardening.sql revoked EXECUTE from PUBLIC across the
-- schema, to close a surface where anon could call every SECURITY DEFINER function. That
-- was verified against the hosted project, where it was harmless: Supabase's hosted
-- default privileges grant EXECUTE to `authenticated` *directly*, so removing PUBLIC took
-- nothing away.
--
-- The local stack does not do that. There, several functions were reachable by
-- `authenticated` only through PUBLIC — so revoking PUBLIC removed their only grant, and
-- seven functions became uncallable:
--
--   is_league_member, is_league_organizer, is_league_season_member,
--   is_league_season_organizer, is_platform_admin, can_view_prediction,
--   league_round_fixtures
--
-- All but one are called from inside RLS policies, and a policy expression is evaluated
-- with the querying role's privileges. So on a fresh checkout every read of predictions,
-- leagues or league_members failed with "permission denied for function
-- is_league_member" — the app did not degrade, it stopped.
--
-- This is the same platform-default trap as the table grants (20260725200000) and the anon
-- function grants (20260726110000), now for the third time, and the lesson is the same
-- each time: state the privilege, never inherit it. The difference here is that the
-- inherited grant was load-bearing in one environment and absent in the other, so testing
-- against production alone said everything was fine.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    -- RLS policy helpers. These MUST be executable by authenticated: a policy that calls a
    -- function the querying role cannot execute fails the whole query, it does not simply
    -- return no rows.
    'is_league_member', 'is_league_organizer', 'is_league_season_member',
    'is_league_season_organizer', 'is_platform_admin', 'can_view_prediction',
    'is_service_context',
    -- Read helpers the app calls directly.
    'league_round_fixtures', 'league_weights', 'league_score_components',
    'current_table_order', 'table_race_entries', 'round_selection_state',
    'preview_league', 'league_join_code', 'head_to_head',
    -- Writes, each of which does its own authorization check first.
    'create_league', 'join_league', 'leave_league', 'regenerate_join_code',
    'enrol_league_season', 'update_league_season_settings', 'finalize_round_selection',
    'save_fixture_prediction', 'save_season_table_prediction', 'save_golden_boot_prediction',
    'toggle_fixture_vote', 'create_rule_set_version', 'upsert_prize_scheme',
    'clear_prize_scheme', 'set_member_role', 'remove_member'
  ]
  loop
    execute (
      select coalesce(string_agg(
        format('grant execute on function public.%I(%s) to authenticated;',
               p.proname, pg_get_function_identity_arguments(p.oid)), ' '), '')
        from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = fn
    );
  end loop;
end;
$$;

-- Re-assert the denials, in case a default privilege grants them back on either platform.
revoke execute on all routines in schema public from anon;
alter default privileges in schema public revoke execute on functions from anon;
