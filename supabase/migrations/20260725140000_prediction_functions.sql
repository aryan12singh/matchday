-- Composite fixture prediction save.
--
-- The predict screen shows one card per fixture, but a fixture carries six markets
-- (05-domain-model.md §5.2: "the market granularity exists for scoring and analytics, not
-- for making users file seven separate submissions"). Saving them one PostgREST request
-- at a time would mean six round trips per autosave and, worse, a partial save if the
-- fourth fails — a scoreline stored without its first-scorer pick.
--
-- So the whole card is one function call, one transaction. Note what this function does
-- NOT do: it never bypasses the lock. It runs SECURITY INVOKER, so RLS applies and
-- enforce_prediction_lock fires per row exactly as it would for a direct write. A user
-- who calls it after kickoff gets the same rejection.

set check_function_bodies = off;

create or replace function public.save_fixture_prediction(
  p_fixture_id uuid,
  p_home int,
  p_away int,
  p_goal_diff int default null,
  p_total_goals int default null,
  p_btts boolean default null,
  p_first_team_id uuid default null,
  p_first_team_none boolean default false,
  p_first_scorer_id uuid default null,
  p_first_scorer_none boolean default false
)
returns table (market_code text, saved boolean)
-- INVOKER, deliberately. Making this DEFINER would hand any caller a lock bypass.
security invoker
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_market record;
  v_value jsonb;
begin
  if v_user is null then
    raise exception 'must be signed in to predict'
      using errcode = 'insufficient_privilege';
  end if;

  if p_home is null or p_away is null or p_home < 0 or p_away < 0 or p_home > 99 or p_away > 99 then
    raise exception 'a scoreline needs two goal counts between 0 and 99'
      using errcode = 'check_violation';
  end if;

  if p_first_team_none and p_first_team_id is not null then
    raise exception 'first scoring team cannot be both a team and "no goals"'
      using errcode = 'check_violation';
  end if;

  if p_first_scorer_none and p_first_scorer_id is not null then
    raise exception 'first scorer cannot be both a player and "no scorer"'
      using errcode = 'check_violation';
  end if;

  for v_market in
    select m.id, mt.code
      from public.markets m
      join public.market_types mt on mt.id = m.market_type_id
     where m.fixture_id = p_fixture_id
       and mt.scope = 'fixture'
       and mt.active
  loop
    v_value := case v_market.code
      when 'correct_score' then jsonb_build_object('home', p_home, 'away', p_away)
      when 'goal_diff' then jsonb_build_object('value', p_goal_diff)
      when 'total_goals' then jsonb_build_object('value', p_total_goals)
      when 'btts' then jsonb_build_object('value', p_btts)
      when 'first_scoring_team' then
        jsonb_build_object('teamId', p_first_team_id, 'none', coalesce(p_first_team_none, false))
      when 'first_goalscorer' then
        jsonb_build_object('playerId', p_first_scorer_id, 'none', coalesce(p_first_scorer_none, false))
      else null
    end;

    if v_value is null then
      continue;
    end if;

    -- The lock trigger fires on each of these. One rejected row aborts the whole call,
    -- which is what we want: a half-saved card is worse than a rejected one.
    insert into public.predictions (user_id, market_id, value)
    values (v_user, v_market.id, v_value)
    on conflict (user_id, market_id) do update
      set value = excluded.value
      -- Skip the write (and the revision row) when nothing actually changed, so autosave
      -- on an untouched card does not pad the audit trail.
      where public.predictions.value is distinct from excluded.value;

    market_code := v_market.code;
    saved := true;
    return next;
  end loop;
end;
$$;

revoke all on function public.save_fixture_prediction(
  uuid, int, int, int, int, boolean, uuid, boolean, uuid, boolean) from public;
grant execute on function public.save_fixture_prediction(
  uuid, int, int, int, int, boolean, uuid, boolean, uuid, boolean) to authenticated;

comment on function public.save_fixture_prediction(
  uuid, int, int, int, int, boolean, uuid, boolean, uuid, boolean) is
  'Saves one fixture card across its six markets in a single transaction. SECURITY INVOKER: RLS and the kickoff lock apply exactly as for a direct write.';

-- ---------------------------------------------------------------------------
-- Season markets: the table predictor and Golden Boot, locked at the season's first
-- kickoff. Same INVOKER reasoning.
-- ---------------------------------------------------------------------------
create or replace function public.save_season_table_prediction(
  p_season_id uuid,
  p_order uuid[]
)
returns uuid
security invoker
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_market_id uuid;
begin
  if v_user is null then
    raise exception 'must be signed in' using errcode = 'insufficient_privilege';
  end if;

  if array_length(p_order, 1) is distinct from 20 then
    raise exception 'the predicted table must rank all 20 teams'
      using errcode = 'check_violation';
  end if;

  -- A table with a team in two places is not a table.
  if (select count(distinct t) from unnest(p_order) t) <> 20 then
    raise exception 'the predicted table must list each team exactly once'
      using errcode = 'check_violation';
  end if;

  select m.id into v_market_id
    from public.markets m
    join public.market_types mt on mt.id = m.market_type_id
   where m.season_id = p_season_id and mt.code = 'season_table';

  if v_market_id is null then
    raise exception 'no season table market for this season'
      using errcode = 'no_data_found';
  end if;

  insert into public.predictions (user_id, market_id, value)
  values (v_user, v_market_id, jsonb_build_object('order', to_jsonb(p_order)))
  on conflict (user_id, market_id) do update
    set value = excluded.value
    where public.predictions.value is distinct from excluded.value;

  return v_market_id;
end;
$$;

revoke all on function public.save_season_table_prediction(uuid, uuid[]) from public;
grant execute on function public.save_season_table_prediction(uuid, uuid[]) to authenticated;

create or replace function public.save_golden_boot_prediction(
  p_season_id uuid,
  p_player_id uuid
)
returns uuid
security invoker
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_market_id uuid;
begin
  if v_user is null then
    raise exception 'must be signed in' using errcode = 'insufficient_privilege';
  end if;

  select m.id into v_market_id
    from public.markets m
    join public.market_types mt on mt.id = m.market_type_id
   where m.season_id = p_season_id and mt.code = 'season_golden_boot';

  if v_market_id is null then
    raise exception 'no Golden Boot market for this season'
      using errcode = 'no_data_found';
  end if;

  insert into public.predictions (user_id, market_id, value)
  values (v_user, v_market_id, jsonb_build_object('playerId', p_player_id))
  on conflict (user_id, market_id) do update
    set value = excluded.value
    where public.predictions.value is distinct from excluded.value;

  return v_market_id;
end;
$$;

revoke all on function public.save_golden_boot_prediction(uuid, uuid) from public;
grant execute on function public.save_golden_boot_prediction(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Market creation for a fixture. Called by the bootstrap and fixture-sync jobs.
--
-- locks_at is the fixture's own kickoff (D6, addendum §H.5). A reschedule moves it, and
-- predictions survive: the market keeps its identity, only its deadline moves.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_fixture_markets(p_fixture_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_created int := 0;
  v_fixture record;
begin
  select f.id, f.kickoff_at, s.id as season_id
    into v_fixture
    from public.fixtures f
    join public.rounds r on r.id = f.round_id
    join public.stages st on st.id = r.stage_id
    join public.seasons s on s.id = st.season_id
   where f.id = p_fixture_id;

  if not found then
    raise exception 'unknown fixture %', p_fixture_id;
  end if;

  insert into public.markets (market_type_id, season_id, fixture_id, opens_at, locks_at)
  select mt.id, v_fixture.season_id, v_fixture.id, now(), v_fixture.kickoff_at
    from public.market_types mt
   where mt.scope = 'fixture' and mt.active
  on conflict (market_type_id, season_id, fixture_id, round_id) do update
    -- Reschedules move the deadline; they never reset a prediction.
    set locks_at = excluded.locks_at
    where public.markets.status = 'open'
      and public.markets.locks_at is distinct from excluded.locks_at;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

create or replace function public.ensure_season_markets(p_season_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_created int := 0;
  v_first_kickoff timestamptz;
begin
  select first_kickoff_at into v_first_kickoff
    from public.seasons where id = p_season_id;

  if v_first_kickoff is null then
    -- Derive it if the bootstrap has not cached it yet.
    select min(f.kickoff_at) into v_first_kickoff
      from public.fixtures f
      join public.rounds r on r.id = f.round_id
      join public.stages st on st.id = r.stage_id
     where st.season_id = p_season_id;

    update public.seasons set first_kickoff_at = v_first_kickoff where id = p_season_id;
  end if;

  if v_first_kickoff is null then
    return 0;
  end if;

  -- Addendum §H.5: season markets lock at the season's first kickoff. Hard. No grace
  -- window, no late entries.
  insert into public.markets (market_type_id, season_id, fixture_id, round_id, opens_at, locks_at)
  select mt.id, p_season_id, null, null, now(), v_first_kickoff
    from public.market_types mt
   where mt.scope = 'season' and mt.active
  on conflict (market_type_id, season_id, fixture_id, round_id) do update
    set locks_at = excluded.locks_at
    where public.markets.status = 'open'
      and public.markets.locks_at is distinct from excluded.locks_at;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;
