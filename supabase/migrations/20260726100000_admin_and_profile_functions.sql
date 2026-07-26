-- League administration, prize schemes, rivals and profile settings.
--
-- Everything here is a SECURITY DEFINER function for the same reason the league functions
-- are: the authorization check belongs next to the write, not in a route handler that a
-- future caller might bypass.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Rule-set versions.
--
-- Invariant 4: versions are immutable and mid-season changes create a NEW version bound
-- from a chosen round. This function is the only way to change weights, and it cannot
-- rewrite history even if someone wants it to — the immutability trigger would refuse.
--
-- The effective_from_round guard is the important part: binding a new version from a
-- round that has already been played would silently revalue settled results.
-- ---------------------------------------------------------------------------
create or replace function public.create_rule_set_version(
  p_league_season_id uuid,
  p_definition jsonb,
  p_effective_from_round int,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule_set_id uuid;
  v_next_version int;
  v_version_id uuid;
  v_completed_rounds int;
begin
  if not public.is_league_season_organizer(p_league_season_id) then
    raise exception 'only an organizer can change scoring rules'
      using errcode = 'insufficient_privilege';
  end if;

  if p_effective_from_round < 1 then
    raise exception 'effective_from_round must be at least 1'
      using errcode = 'check_violation';
  end if;

  -- Refuse to revalue a round that has already been played.
  select count(*) into v_completed_rounds
    from public.rounds r
    join public.stages st on st.id = r.stage_id
    join public.league_seasons ls on ls.season_id = st.season_id
   where ls.id = p_league_season_id
     and r.status = 'completed'
     and r.number >= p_effective_from_round;

  if v_completed_rounds > 0 then
    raise exception 'round % has already been played — choose a later round', p_effective_from_round
      using errcode = 'check_violation';
  end if;

  select rsv.rule_set_id into v_rule_set_id
    from public.league_rule_bindings b
    join public.rule_set_versions rsv on rsv.id = b.rule_set_version_id
   where b.league_season_id = p_league_season_id
   order by b.effective_from_round desc
   limit 1;

  if v_rule_set_id is null then
    raise exception 'this league has no rule set bound'
      using errcode = 'no_data_found';
  end if;

  select coalesce(max(version), 0) + 1 into v_next_version
    from public.rule_set_versions where rule_set_id = v_rule_set_id;

  insert into public.rule_set_versions
    (rule_set_id, version, engine_version, definition, notes)
  values (v_rule_set_id, v_next_version, '1.0.0', p_definition,
          coalesce(p_notes, 'Edited by league organizer'))
  returning id into v_version_id;

  insert into public.league_rule_bindings
    (league_season_id, rule_set_version_id, effective_from_round, bound_by)
  values (p_league_season_id, v_version_id, p_effective_from_round, auth.uid())
  on conflict (league_season_id, effective_from_round) do update
    set rule_set_version_id = excluded.rule_set_version_id,
        bound_at = now(),
        bound_by = excluded.bound_by;

  return v_version_id;
end;
$$;

revoke all on function public.create_rule_set_version(uuid, jsonb, int, text) from public;
grant execute on function public.create_rule_set_version(uuid, jsonb, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Prize schemes.
--
-- The app never moves money — this is a ledger among friends (§6.5). A zero-sum table
-- must sum to zero, validated here rather than in the UI, because a table that does not
-- balance means somebody is owed money that nobody owes.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_prize_scheme(
  p_league_season_id uuid,
  p_kind text,
  p_currency_label text,
  p_definition jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scheme_id uuid;
  v_sum numeric;
  v_member_count int;
  v_table_len int;
begin
  if not public.is_league_season_organizer(p_league_season_id) then
    raise exception 'only an organizer can configure prizes'
      using errcode = 'insufficient_privilege';
  end if;

  if p_kind = 'zero_sum_rank_table' then
    select count(*) into v_member_count
      from public.league_members lm
      join public.league_seasons ls on ls.league_id = lm.league_id
     where ls.id = p_league_season_id;

    for v_sum, v_table_len in
      select sum(value::numeric), count(*)
        from jsonb_array_elements_text(p_definition -> 'overall')
      union all
      select sum(value::numeric), count(*)
        from jsonb_array_elements_text(p_definition -> 'per_round')
    loop
      if v_sum is not null and v_sum <> 0 then
        raise exception 'a zero-sum prize table must add up to zero (got %)', v_sum
          using errcode = 'check_violation';
      end if;
      if v_table_len is not null and v_table_len <> v_member_count then
        raise exception 'prize table has % rows but the league has % members',
          v_table_len, v_member_count
          using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  insert into public.prize_schemes
    (league_season_id, kind, currency_label, definition, activated_at)
  values (p_league_season_id, p_kind, coalesce(p_currency_label, '$'), p_definition, now())
  returning id into v_scheme_id;

  -- Pointing league_seasons at the scheme is what switches money UI on app-wide.
  update public.league_seasons
     set prize_scheme_id = v_scheme_id
   where id = p_league_season_id;

  return v_scheme_id;
end;
$$;

revoke all on function public.upsert_prize_scheme(uuid, text, text, jsonb) from public;
grant execute on function public.upsert_prize_scheme(uuid, text, text, jsonb) to authenticated;

/** Turning prizes off returns the league to points-only and hides all money UI. */
create or replace function public.clear_prize_scheme(p_league_season_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_league_season_organizer(p_league_season_id) then
    raise exception 'only an organizer can configure prizes'
      using errcode = 'insufficient_privilege';
  end if;

  update public.league_seasons set prize_scheme_id = null where id = p_league_season_id;
end;
$$;

revoke all on function public.clear_prize_scheme(uuid) from public;
grant execute on function public.clear_prize_scheme(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Member management.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_role(
  p_league_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining_organizers int;
begin
  if not public.is_league_organizer(p_league_id) then
    raise exception 'only an organizer can change roles'
      using errcode = 'insufficient_privilege';
  end if;

  if p_role not in ('organizer', 'member') then
    raise exception 'unknown role %', p_role using errcode = 'check_violation';
  end if;

  -- Demoting the last organizer would leave the league unadministrable, exactly as
  -- leave_league guards against.
  if p_role = 'member' then
    select count(*) into v_remaining_organizers
      from public.league_members
     where league_id = p_league_id and role = 'organizer' and user_id <> p_user_id;

    if v_remaining_organizers = 0 then
      raise exception 'promote another organizer first' using errcode = 'check_violation';
    end if;
  end if;

  update public.league_members
     set role = p_role
   where league_id = p_league_id and user_id = p_user_id;
end;
$$;

revoke all on function public.set_member_role(uuid, uuid, text) from public;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

create or replace function public.remove_member(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_league_organizer(p_league_id) then
    raise exception 'only an organizer can remove members'
      using errcode = 'insufficient_privilege';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'use leave_league to remove yourself' using errcode = 'check_violation';
  end if;

  delete from public.league_members
   where league_id = p_league_id and user_id = p_user_id;

  insert into public.league_events (league_id, type, actor_user_id, payload)
  values (p_league_id, 'member_removed', auth.uid(),
          jsonb_build_object('user_id', p_user_id));
end;
$$;

revoke all on function public.remove_member(uuid, uuid) from public;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Head-to-head. Two members' per-round points, side by side.
-- ---------------------------------------------------------------------------
create or replace function public.head_to_head(
  p_league_season_id uuid,
  p_other_user_id uuid
)
returns table (
  round_id uuid,
  round_number int,
  round_name text,
  category text,
  mine boolean,
  theirs boolean
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select r.id,
         r.number,
         r.name,
         sc.category,
         bool_or(sc.user_id = auth.uid() and sc.hit),
         bool_or(sc.user_id = p_other_user_id and sc.hit)
    from public.score_components sc
    join public.markets m on m.id = sc.market_id
    join public.fixtures f on f.id = m.fixture_id
    join public.rounds r on r.id = f.round_id
    join public.league_seasons ls on ls.id = p_league_season_id
   where public.is_league_season_member(p_league_season_id)
     and m.season_id = ls.season_id
     and sc.user_id in (auth.uid(), p_other_user_id)
     and f.id in (select fixture_id from public.league_round_fixtures(p_league_season_id, r.id))
   group by r.id, r.number, r.name, sc.category;
$$;

revoke all on function public.head_to_head(uuid, uuid) from public;
grant execute on function public.head_to_head(uuid, uuid) to authenticated;
