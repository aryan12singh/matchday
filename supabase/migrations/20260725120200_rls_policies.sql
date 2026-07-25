-- RLS policy matrix — docs/discovery/10-security-and-rls.md §10.2.
--
-- Threat model: the attacker is a curious, competitive league member, not the internet.
-- Priorities in order: nobody sees hidden predictions early; nobody writes predictions
-- after lock; nobody alters scores or prizes; provider secrets never leak.
--
-- Shape of this file:
--   * Football reference data  -> authenticated read, no client writes at all.
--   * Sync / provider / audit  -> NO client policies. RLS is on and no policy exists,
--                                 so every client role is denied. Only the service role
--                                 (which bypasses RLS) and server routes reach them.
--   * Everything user-scoped   -> explicit per-table policies below.
--
-- Writes for reference and scoring data go through server routes running as the service
-- role, which is why almost nothing here grants INSERT/UPDATE to clients.

-- ===========================================================================
-- Football reference domain — authenticated read, service-role write only.
-- ===========================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'competitions', 'seasons', 'stages', 'stage_groups', 'rounds', 'teams',
    'team_season_entries', 'players', 'squad_memberships', 'player_equivalences',
    'fixtures', 'fixture_events', 'fixture_lineups', 'fixture_stats', 'standings',
    'season_player_stats', 'market_types', 'markets', 'rule_sets', 'rule_set_versions'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_authenticated_read', t);
  end loop;
end;
$$;

-- Score runs and their diffs are readable by any authenticated user on purpose:
-- "every point traceable" (§6.1) means the audit trail is public to the league, and
-- these rows carry no prediction content.
create policy score_runs_authenticated_read on public.score_runs
  for select to authenticated using (true);

create policy score_run_changes_authenticated_read on public.score_run_changes
  for select to authenticated using (true);

-- ===========================================================================
-- profiles
-- ===========================================================================
create policy profiles_authenticated_read on public.profiles
  for select to authenticated using (true);

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ===========================================================================
-- predictions — the core of the threat model.
--
-- Read: own rows always; others' only through can_view_prediction(), which requires the
-- market to be locked/settled AND a shared league whose reveal policy permits it.
-- Write: own rows only, and only while the market is open — with the enforce_prediction_lock
-- trigger as the hard backstop underneath (a policy alone would be bypassable by any
-- future service-role-adjacent path; the trigger is not).
-- Delete: no policy. Scores are permanent.
-- ===========================================================================
create policy predictions_read_own_or_revealed on public.predictions
  for select to authenticated
  using (user_id = auth.uid() or public.can_view_prediction(market_id, user_id));

create policy predictions_insert_own on public.predictions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.markets m
       where m.id = market_id and m.status = 'open' and m.locks_at > now()));

create policy predictions_update_own on public.predictions
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.markets m
       where m.id = market_id and m.status = 'open' and m.locks_at > now()));

create policy prediction_revisions_read_own on public.prediction_revisions
  for select to authenticated using (user_id = auth.uid());

-- ===========================================================================
-- score_components — visible exactly when the underlying prediction is visible,
-- so a settled-but-unrevealed market cannot leak someone's picks through their hits.
-- ===========================================================================
create policy score_components_read_when_prediction_visible on public.score_components
  for select to authenticated
  using (user_id = auth.uid() or public.can_view_prediction(market_id, user_id));

-- ===========================================================================
-- leagues
--
-- Members read their own leagues. join_code is NOT excluded at the policy level —
-- Postgres has no column-level RLS — so it is revoked from `authenticated` below and
-- re-granted to nobody: organizers read it through the security-definer
-- league_join_code() function. Non-members reach a league only via preview_league().
-- ===========================================================================
create policy leagues_member_read on public.leagues
  for select to authenticated using (public.is_league_member(id));

create policy leagues_organizer_update on public.leagues
  for update to authenticated
  using (public.is_league_organizer(id))
  with check (public.is_league_organizer(id));

-- Column privileges, not RLS: Postgres has no column-level row policy, and a
-- column-level REVOKE is a no-op while table-level SELECT is still granted. So the
-- table grant is withdrawn and re-issued column by column, omitting join_code.
-- §10.4 test 4: a member cannot read the join code; an organizer can, via
-- league_join_code() below.
revoke select on public.leagues from authenticated, anon;
grant select (id, name, visibility, created_by, created_at, updated_at)
  on public.leagues to authenticated;

create or replace function public.league_join_code(p_league_id uuid)
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select case when public.is_league_organizer(p_league_id)
              then (select l.join_code from public.leagues l where l.id = p_league_id)
              else null
         end;
$$;

revoke all on function public.league_join_code(uuid) from public;
grant execute on function public.league_join_code(uuid) to authenticated;

comment on function public.league_join_code(uuid) is
  'Organizer-only read of a league join code (§10.4 test 4). Members get null.';

-- ===========================================================================
-- league_members
-- ===========================================================================
create policy league_members_read_same_league on public.league_members
  for select to authenticated using (public.is_league_member(league_id));

-- Membership is created by join_league() (SECURITY DEFINER). Self-insert is also allowed
-- so an organizer creating a league can enrol themselves in the same request.
create policy league_members_insert_self on public.league_members
  for insert to authenticated with check (user_id = auth.uid());

create policy league_members_delete_self_or_organizer on public.league_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_league_organizer(league_id));

-- ===========================================================================
-- league_seasons, rule bindings, prize schemes — members read, server routes write.
-- ===========================================================================
create policy league_seasons_member_read on public.league_seasons
  for select to authenticated using (public.is_league_member(league_id));

create policy league_rule_bindings_member_read on public.league_rule_bindings
  for select to authenticated using (public.is_league_season_member(league_season_id));

create policy prize_schemes_member_read on public.prize_schemes
  for select to authenticated using (public.is_league_season_member(league_season_id));

create policy prize_settlements_member_read on public.prize_settlements
  for select to authenticated using (public.is_league_season_member(league_season_id));

create policy rank_snapshots_member_read on public.rank_snapshots
  for select to authenticated using (public.is_league_season_member(league_season_id));

create policy league_events_member_read on public.league_events
  for select to authenticated using (public.is_league_member(league_id));

-- ===========================================================================
-- rivals — own rows only.
-- ===========================================================================
create policy rivals_own_read on public.rivals
  for select to authenticated using (user_id = auth.uid());

create policy rivals_own_write on public.rivals
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_league_member(league_id));

-- ===========================================================================
-- Addendum §B — selections and votes.
--
-- Selections are readable by league members. Votes are NOT readable at all, even to
-- their owner's league mates: identity must never be exposed (§H.2), and tallies come
-- from the league_vote_tallies view instead. Members may insert and delete their own
-- votes; the enforce_vote_window trigger rejects both once the round is finalized.
-- ===========================================================================
create policy league_round_selections_member_read on public.league_round_selections
  for select to authenticated using (public.is_league_season_member(league_season_id));

create policy league_fixture_votes_read_own on public.league_fixture_votes
  for select to authenticated using (user_id = auth.uid());

create policy league_fixture_votes_insert_own on public.league_fixture_votes
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_league_season_member(league_season_id));

create policy league_fixture_votes_delete_own on public.league_fixture_votes
  for delete to authenticated using (user_id = auth.uid());

-- ===========================================================================
-- Notifications — own rows.
-- ===========================================================================
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notification_prefs_own on public.notification_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notification_log_read_own on public.notification_log
  for select to authenticated using (user_id = auth.uid());

-- ===========================================================================
-- Deliberately policy-free (§10.2 last row): raw_payloads, sync_runs,
-- provider_quota_ledger, job_state, admin_audit_log, provider_entity_map, rate_limits.
-- /ops reads them through server components using the service client behind an
-- is_platform_admin() check.
--
-- RLS with no policy already returns zero rows, but that is one accidental permissive
-- policy away from leaking. Supabase's default privileges grant these tables to anon and
-- authenticated, so the grants are withdrawn too: reaching them from a client is then a
-- hard permission error rather than a policy-dependent empty result. Defence in depth for
-- the one table (`raw_payloads`) that holds verbatim provider responses.
-- ===========================================================================
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

-- ===========================================================================
-- §9.6.7 — Realtime publication is narrowed to tables that carry no pre-lock
-- prediction content. Nothing prediction-related is ever published.
-- ===========================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.fixtures;
    alter publication supabase_realtime add table public.fixture_events;
    alter publication supabase_realtime add table public.league_events;
  end if;
end;
$$;
