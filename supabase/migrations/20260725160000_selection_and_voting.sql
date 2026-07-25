-- League fixture selection and voting — addendum §B.
--
-- Votes are advisory. The organizer holds final power and may deviate from the tally at
-- any point before the first *selected* kickoff. The one thing neither of them can do is
-- leave a round empty: the fallback guarantees every round counts something.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Toggle one vote. Idempotent per (member, fixture): calling it twice returns to the
-- unvoted state, which is what a toggle in the UI means.
--
-- The enforce_vote_window trigger rejects writes after finalization, so this does not
-- re-check that — one authority for the rule, not two that can drift.
-- ---------------------------------------------------------------------------
create or replace function public.toggle_fixture_vote(
  p_league_season_id uuid,
  p_round_id uuid,
  p_fixture_id uuid
)
returns boolean
security invoker
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_deleted int;
begin
  if v_user is null then
    raise exception 'must be signed in to vote' using errcode = 'insufficient_privilege';
  end if;

  delete from public.league_fixture_votes
   where league_season_id = p_league_season_id
     and round_id = p_round_id
     and fixture_id = p_fixture_id
     and user_id = v_user;

  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    return false;
  end if;

  insert into public.league_fixture_votes (league_season_id, round_id, fixture_id, user_id)
  values (p_league_season_id, p_round_id, p_fixture_id, v_user);

  return true;
end;
$$;

revoke all on function public.toggle_fixture_vote(uuid, uuid, uuid) from public;
grant execute on function public.toggle_fixture_vote(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Organizer finalizes the round's selection.
--
-- Replaces the whole selection rather than merging, so the organizer's screen is the
-- truth and an un-ticked fixture actually disappears. Refuses an empty list: invariant 7
-- says a round can never finalize empty, and the friendliest place to enforce that is
-- before it happens rather than by silently substituting a fallback.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_round_selection(
  p_league_season_id uuid,
  p_round_id uuid,
  p_fixture_ids uuid[]
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
  v_first_selected_kickoff timestamptz;
begin
  if not public.is_league_season_organizer(p_league_season_id) then
    raise exception 'only an organizer can finalize the selection'
      using errcode = 'insufficient_privilege';
  end if;

  if p_fixture_ids is null or array_length(p_fixture_ids, 1) is null then
    raise exception 'a finalized round must contain at least one fixture'
      using errcode = 'check_violation';
  end if;

  -- The organizer may adjust up until the first *selected* kickoff (addendum §B), not the
  -- round's first kickoff: a round whose opener was never selected is still adjustable.
  select min(f.kickoff_at) into v_first_selected_kickoff
    from public.league_round_selections s
    join public.fixtures f on f.id = s.fixture_id
   where s.league_season_id = p_league_season_id
     and s.round_id = p_round_id
     and s.finalized_at is not null;

  if v_first_selected_kickoff is not null and v_first_selected_kickoff <= now() then
    raise exception 'the first selected fixture has already kicked off'
      using errcode = 'check_violation';
  end if;

  delete from public.league_round_selections
   where league_season_id = p_league_season_id and round_id = p_round_id;

  insert into public.league_round_selections
    (league_season_id, round_id, fixture_id, source, finalized_at)
  select p_league_season_id, p_round_id, f.id, 'admin', now()
    from public.fixtures f
   where f.id = any(p_fixture_ids)
     and f.round_id = p_round_id;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'none of those fixtures belong to this round'
      using errcode = 'check_violation';
  end if;

  insert into public.league_events (league_id, type, actor_user_id, payload)
  select ls.league_id, 'selection_finalized', auth.uid(),
         jsonb_build_object('round_id', p_round_id, 'fixtures', v_count)
    from public.league_seasons ls
   where ls.id = p_league_season_id;

  return v_count;
end;
$$;

revoke all on function public.finalize_round_selection(uuid, uuid, uuid[]) from public;
grant execute on function public.finalize_round_selection(uuid, uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Automatic fallback, run by the tick.
--
-- Addendum §B: a round still unfinalized 24 hours before its first kickoff counts every
-- fixture, and members are told. This is the guarantee that makes the whole feature safe
-- to ship — an organizer who goes quiet cannot cost their league a matchweek.
-- ---------------------------------------------------------------------------
create or replace function public.apply_selection_fallbacks()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_applied int := 0;
  v_row record;
begin
  for v_row in
    select ls.id as league_season_id, ls.league_id, r.id as round_id
      from public.league_seasons ls
      join public.seasons s on s.id = ls.season_id
      join public.stages st on st.season_id = s.id
      join public.rounds r on r.stage_id = st.id
     where ls.selection_mode <> 'all'
       and ls.status = 'active'
       -- Within 24h of the round's first kickoff, and not yet finalized.
       and (select min(f.kickoff_at) from public.fixtures f where f.round_id = r.id)
             between now() and now() + interval '24 hours'
       and not exists (
         select 1 from public.league_round_selections sel
          where sel.league_season_id = ls.id
            and sel.round_id = r.id
            and sel.finalized_at is not null)
  loop
    insert into public.league_round_selections
      (league_season_id, round_id, fixture_id, source, finalized_at)
    select v_row.league_season_id, v_row.round_id, f.id, 'fallback', now()
      from public.fixtures f
     where f.round_id = v_row.round_id
    on conflict (league_season_id, round_id, fixture_id) do update
      set source = 'fallback', finalized_at = now();

    insert into public.league_events (league_id, type, payload)
    values (v_row.league_id, 'selection_fallback',
            jsonb_build_object('round_id', v_row.round_id));

    v_applied := v_applied + 1;
  end loop;

  return v_applied;
end;
$$;

revoke all on function public.apply_selection_fallbacks() from public, anon, authenticated;
grant execute on function public.apply_selection_fallbacks() to service_role;

comment on function public.apply_selection_fallbacks() is
  'Addendum §B fallback: an unfinalized round 24h before first kickoff counts every fixture. Invariant 7 — a round can never be empty.';

-- ---------------------------------------------------------------------------
-- Everything the selection screen needs in one call: each fixture in the round with its
-- tally, whether the caller voted for it, and whether it is currently selected.
-- ---------------------------------------------------------------------------
create or replace function public.round_selection_state(
  p_league_season_id uuid,
  p_round_id uuid
)
returns table (
  fixture_id uuid,
  kickoff_at timestamptz,
  home_name text,
  away_name text,
  home_code text,
  away_code text,
  votes int,
  voted_by_me boolean,
  selected boolean
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select f.id,
         f.kickoff_at,
         h.name, a.name, h.code, a.code,
         coalesce(v.votes, 0)::int,
         exists (
           select 1 from public.league_fixture_votes mine
            where mine.league_season_id = p_league_season_id
              and mine.round_id = p_round_id
              and mine.fixture_id = f.id
              and mine.user_id = auth.uid()),
         exists (
           select 1 from public.league_round_selections s
            where s.league_season_id = p_league_season_id
              and s.round_id = p_round_id
              and s.fixture_id = f.id
              and s.finalized_at is not null)
    from public.fixtures f
    join public.teams h on h.id = f.home_team_id
    join public.teams a on a.id = f.away_team_id
    left join (
      select lfv.fixture_id, count(*)::int as votes
        from public.league_fixture_votes lfv
       where lfv.league_season_id = p_league_season_id
         and lfv.round_id = p_round_id
       group by lfv.fixture_id
    ) v on v.fixture_id = f.id
   -- Membership gate: this function is DEFINER, so it must check for itself.
   where public.is_league_season_member(p_league_season_id)
     and f.round_id = p_round_id
   order by f.kickoff_at;
$$;

revoke all on function public.round_selection_state(uuid, uuid) from public;
grant execute on function public.round_selection_state(uuid, uuid) to authenticated;
