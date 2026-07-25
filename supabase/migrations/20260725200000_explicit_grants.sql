-- Explicit table privileges for every client role.
--
-- Until now the schema relied on Supabase's implicit default privileges, which used to
-- grant ALL on new public tables to anon, authenticated and service_role. Current
-- Supabase does not: a freshly created table lands with only TRUNCATE, REFERENCES and
-- TRIGGER, so every client query fails with 42501 before RLS is even consulted.
--
-- This was invisible locally on an older CLI and caught by CI on `latest`. On a new
-- hosted project it would have meant a completely non-functional app — every read and
-- write denied — which is the kind of thing that is only obvious once it happens.
--
-- Relying on a platform default for something this load-bearing was the actual mistake.
-- Privileges are now stated here, per table, mirroring the policies in
-- 20260725120200_rls_policies.sql. RLS still does the row filtering; these grants only
-- decide which verbs a role may attempt at all. Both layers have to agree, and now both
-- are written down in the same repository.

-- ---------------------------------------------------------------------------
-- service_role: the backend. Bypasses RLS, but *not* grants — jobs, settlement and
-- the tick all need real privileges or they fail the same way clients did.
-- ---------------------------------------------------------------------------
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all routines in schema public to service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;

-- ---------------------------------------------------------------------------
-- authenticated: exactly the verbs the policies allow, and no others.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, anon;

-- Football reference data and the scoring audit trail: read-only. All writes go through
-- server routes running as the service role.
do $$
declare
  t text;
begin
  foreach t in array array[
    'competitions', 'seasons', 'stages', 'stage_groups', 'rounds', 'teams',
    'team_season_entries', 'players', 'squad_memberships', 'player_equivalences',
    'fixtures', 'fixture_events', 'fixture_lineups', 'fixture_stats', 'standings',
    'season_player_stats', 'market_types', 'markets', 'rule_sets', 'rule_set_versions',
    'score_runs', 'score_run_changes', 'score_components', 'prediction_revisions',
    'league_seasons', 'league_rule_bindings', 'prize_schemes', 'prize_settlements',
    'rank_snapshots', 'league_events', 'league_round_selections', 'notification_log'
  ]
  loop
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;

-- Predictions: insert and update own, never delete. Scores are permanent, and the
-- absence of DELETE here is the second lock on that after the missing policy.
grant select, insert, update on public.predictions to authenticated;

-- Profiles: read all, create and edit own.
grant select, insert, update on public.profiles to authenticated;

-- Leagues: column-restricted read (join_code is withheld — see the rls_policies
-- migration) plus an organizer-only update, filtered by policy.
grant select (id, name, visibility, created_by, created_at, updated_at)
  on public.leagues to authenticated;
grant update on public.leagues to authenticated;

-- Membership: read same-league, self-insert via join_league(), leave or be removed.
grant select, insert, delete on public.league_members to authenticated;

-- Votes: own row only, and the enforce_vote_window trigger closes the window.
grant select, insert, delete on public.league_fixture_votes to authenticated;

-- Own-row tables.
grant select, insert, update, delete on public.rivals to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.notification_prefs to authenticated;

-- The anonymised tally view.
grant select on public.league_vote_tallies to authenticated;

-- ---------------------------------------------------------------------------
-- Re-assert the denials, in case a default privilege elsewhere granted them.
--
-- These tables have no client policies at all (§10.2). RLS alone would already return
-- nothing, but a table holding verbatim provider responses deserves a hard permission
-- error rather than a policy-dependent empty result.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'raw_payloads', 'sync_runs', 'provider_quota_ledger', 'job_state',
    'admin_audit_log', 'provider_entity_map', 'rate_limits'
  ]
  loop
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- anon reaches nothing directly. The join-flow preview is a SECURITY DEFINER function,
-- which is the only thing a signed-out visitor needs.
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Future tables inherit nothing by accident: a new table is unreachable until a
-- migration grants it explicitly, which is the safe direction to fail in.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
