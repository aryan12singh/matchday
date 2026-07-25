-- League creation, enrolment and rule binding.
--
-- §10.2 says league creation happens "via server route". These are SECURITY DEFINER
-- functions rather than service-role writes from a server action, for two reasons:
-- creating a league and its organizer membership must be atomic (a league with no
-- organizer can never be administered), and a service-role client in a server action is
-- one refactor away from being imported somewhere it should not be.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Join codes: high entropy, >= 10 chars, regenerable (§10.3).
--
-- Crockford-style alphabet with I, L, O, U removed: these get read aloud and typed by
-- hand in a group chat, and 0/O and 1/I/L are where that goes wrong.
-- ---------------------------------------------------------------------------
create or replace function public.generate_join_code(p_length int default 10)
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  result text := '';
  i int;
begin
  for i in 1..p_length loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.create_league(p_name text)
returns table (league_id uuid, join_code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_code text;
  v_attempts int := 0;
begin
  if v_user is null then
    raise exception 'must be signed in to create a league'
      using errcode = 'insufficient_privilege';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'a league needs a name' using errcode = 'check_violation';
  end if;

  -- Retry on the (vanishingly unlikely) collision rather than failing the request.
  loop
    v_attempts := v_attempts + 1;
    v_code := public.generate_join_code(10);
    exit when not exists (select 1 from public.leagues l where l.join_code = v_code);
    if v_attempts > 10 then
      raise exception 'could not allocate a join code';
    end if;
  end loop;

  insert into public.leagues (name, join_code, created_by)
  values (left(btrim(p_name), 60), v_code, v_user)
  returning id into v_id;

  -- Atomic with the insert above: a league without an organizer is unadministrable.
  insert into public.league_members (league_id, user_id, role)
  values (v_id, v_user, 'organizer');

  insert into public.league_events (league_id, type, actor_user_id, payload)
  values (v_id, 'league_created', v_user, jsonb_build_object('name', p_name));

  return query select v_id, v_code;
end;
$$;

revoke all on function public.create_league(text) from public;
grant execute on function public.create_league(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Regenerate a join code. Organizer only — this is the "someone screenshotted the
-- code into the wrong chat" button.
-- ---------------------------------------------------------------------------
create or replace function public.regenerate_join_code(p_league_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  if not public.is_league_organizer(p_league_id) then
    raise exception 'only an organizer can regenerate the join code'
      using errcode = 'insufficient_privilege';
  end if;

  loop
    v_code := public.generate_join_code(10);
    exit when not exists (select 1 from public.leagues l where l.join_code = v_code);
  end loop;

  update public.leagues set join_code = v_code where id = p_league_id;
  return v_code;
end;
$$;

revoke all on function public.regenerate_join_code(uuid) from public;
grant execute on function public.regenerate_join_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enrol a league in a competition season, and bind the current rule set.
--
-- Binding happens here rather than in a weight-editor UI (deferred post-launch): a
-- league_season with no rule binding would aggregate to zero points for everyone, which
-- looks exactly like a scoring bug. Every enrolment gets v1 from round 1.
-- ---------------------------------------------------------------------------
create or replace function public.enrol_league_season(
  p_league_id uuid,
  p_season_id uuid,
  p_reveal_policy text default 'at_kickoff',
  p_selection_mode text default 'all'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_league_season_id uuid;
  v_version_id uuid;
begin
  if not public.is_league_organizer(p_league_id) then
    raise exception 'only an organizer can enrol this league'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.league_seasons (league_id, season_id, reveal_policy, selection_mode)
  values (p_league_id, p_season_id, p_reveal_policy, p_selection_mode)
  on conflict (league_id, season_id) do update
    set reveal_policy = excluded.reveal_policy,
        selection_mode = excluded.selection_mode
  returning id into v_league_season_id;

  -- Latest version of the seeded rule set.
  select rsv.id into v_version_id
    from public.rule_set_versions rsv
    join public.rule_sets rs on rs.id = rsv.rule_set_id
   order by rsv.version desc
   limit 1;

  if v_version_id is null then
    raise exception 'no rule set version to bind — is the seed loaded?';
  end if;

  insert into public.league_rule_bindings
    (league_season_id, rule_set_version_id, effective_from_round, bound_by)
  values (v_league_season_id, v_version_id, 1, auth.uid())
  on conflict (league_season_id, effective_from_round) do nothing;

  return v_league_season_id;
end;
$$;

revoke all on function public.enrol_league_season(uuid, uuid, text, text) from public;
grant execute on function public.enrol_league_season(uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- League settings an organizer may change. Kept as a function so the allowed set is
-- explicit — `leagues` has an organizer UPDATE policy, but league_seasons deliberately
-- has no client write policy at all.
-- ---------------------------------------------------------------------------
create or replace function public.update_league_season_settings(
  p_league_season_id uuid,
  p_reveal_policy text default null,
  p_selection_mode text default null,
  p_fixtures_per_round int default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_league_season_organizer(p_league_season_id) then
    raise exception 'only an organizer can change league settings'
      using errcode = 'insufficient_privilege';
  end if;

  update public.league_seasons
     set reveal_policy = coalesce(p_reveal_policy, reveal_policy),
         selection_mode = coalesce(p_selection_mode, selection_mode),
         -- Explicitly nullable (addendum §H.1): passing -1 clears the target.
         fixtures_per_round = case
           when p_fixtures_per_round is null then fixtures_per_round
           when p_fixtures_per_round < 0 then null
           else p_fixtures_per_round
         end
   where id = p_league_season_id;
end;
$$;

revoke all on function public.update_league_season_settings(uuid, text, text, int) from public;
grant execute on function public.update_league_season_settings(uuid, text, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Leaving a league. An organizer may not leave while they are the last one, or the
-- league becomes unadministrable.
-- ---------------------------------------------------------------------------
create or replace function public.leave_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_other_organizers int;
begin
  select role into v_role
    from public.league_members
   where league_id = p_league_id and user_id = v_user;

  if v_role is null then
    return;
  end if;

  if v_role = 'organizer' then
    select count(*) into v_other_organizers
      from public.league_members
     where league_id = p_league_id and role = 'organizer' and user_id <> v_user;

    if v_other_organizers = 0 then
      raise exception 'promote another organizer before leaving'
        using errcode = 'check_violation';
    end if;
  end if;

  delete from public.league_members
   where league_id = p_league_id and user_id = v_user;

  insert into public.league_events (league_id, type, actor_user_id)
  values (p_league_id, 'member_left', v_user);
end;
$$;

revoke all on function public.leave_league(uuid) from public;
grant execute on function public.leave_league(uuid) to authenticated;

-- join_league already exists (20260725120100). Extend it to log the event so the
-- activity feed has something to show from day one.
create or replace function public.join_league(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_league_id uuid;
  v_user uuid := auth.uid();
  v_inserted int := 0;
begin
  if v_user is null then
    raise exception 'must be signed in to join a league'
      using errcode = 'insufficient_privilege';
  end if;

  select l.id into v_league_id
    from public.leagues l
   where upper(l.join_code) = upper(btrim(p_code));

  if v_league_id is null then
    raise exception 'invalid join code'
      using errcode = 'no_data_found';
  end if;

  insert into public.league_members (league_id, user_id, role)
  values (v_league_id, v_user, 'member')
  on conflict (league_id, user_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    insert into public.league_events (league_id, type, actor_user_id)
    values (v_league_id, 'member_joined', v_user);
  end if;

  return v_league_id;
end;
$$;

revoke all on function public.join_league(text) from public;
grant execute on function public.join_league(text) to authenticated;
