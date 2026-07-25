-- Membership gates must not lock out the service role.
--
-- Found by scripts/matchday-drill.ts: league_score_components is SECURITY DEFINER and
-- gates on is_league_season_member(), which resolves auth.uid(). Jobs run as the service
-- role, where auth.uid() is null — so every membership-gated read returned zero rows to
-- them, silently.
--
-- The visible symptom in the drill was a leaderboard of zeros after a settlement that had
-- just written sixteen components. The symptom in production would have been worse and
-- quieter: snapshotRanks() runs on the tick as the service role, so rank_snapshots would
-- have filled with zero-point rows all season, and the movement arrows and points-race
-- chart built on them would have been wrong without ever erroring.
--
-- The fix mirrors enforce_prediction_lock's existing convention: no authenticated user
-- means a backend context, which is trusted. Client roles are unaffected — an
-- authenticated caller still has to be a member.

set check_function_bodies = off;

create or replace function public.is_service_context()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  -- Same convention as enforce_prediction_lock: no authenticated user = backend caller.
  -- PostgREST always sets a role, and anon/authenticated always carry a uid, so this is
  -- true only for the service role and for direct superuser connections.
  select auth.uid() is null;
$$;

comment on function public.is_service_context() is
  'True when there is no authenticated end user, i.e. a job running as the service role.';

create or replace function public.league_score_components(
  p_league_season_id uuid,
  p_round_id uuid default null
)
returns table (
  user_id uuid,
  market_id uuid,
  category text,
  hit boolean
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select sc.user_id, sc.market_id, sc.category, sc.hit
    from public.score_components sc
    join public.markets m on m.id = sc.market_id
    join public.league_seasons ls on ls.id = p_league_season_id
    join public.fixtures f on f.id = m.fixture_id
    join public.rounds r on r.id = f.round_id
   where (public.is_service_context() or public.is_league_season_member(p_league_season_id))
     and m.season_id = ls.season_id
     and (p_round_id is null or r.id = p_round_id)
     and f.id in (select fixture_id from public.league_round_fixtures(p_league_season_id, r.id))
     and m.fixture_id is not null;
$$;

create or replace function public.league_weights(
  p_league_season_id uuid,
  p_round_number int default null
)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select rsv.definition
    from public.league_rule_bindings b
    join public.rule_set_versions rsv on rsv.id = b.rule_set_version_id
   where b.league_season_id = p_league_season_id
     and b.effective_from_round <= coalesce(p_round_number, 2147483647)
     and (public.is_service_context() or public.is_league_season_member(p_league_season_id))
   order by b.effective_from_round desc
   limit 1;
$$;

create or replace function public.table_race_entries(p_league_season_id uuid)
returns table (
  user_id uuid,
  username text,
  joined_at timestamptz,
  predicted_order jsonb
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.user_id, pr.username, lm.joined_at, p.value -> 'order'
    from public.predictions p
    join public.markets m on m.id = p.market_id
    join public.market_types mt on mt.id = m.market_type_id
    join public.league_seasons ls on ls.id = p_league_season_id and ls.season_id = m.season_id
    join public.league_members lm on lm.league_id = ls.league_id and lm.user_id = p.user_id
    join public.profiles pr on pr.id = p.user_id
   where (public.is_service_context() or public.is_league_season_member(p_league_season_id))
     and mt.code = 'season_table'
     -- Still never exposed while open: settlement has no reason to read an unlocked
     -- entry, so the service role gets no exemption from this one.
     and m.status <> 'open';
$$;

create or replace function public.current_table_order(p_season_id uuid)
returns uuid[]
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select array_agg(s.team_id order by s.position)
    from public.standings s
   where s.season_id = p_season_id;
$$;

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
   where (public.is_service_context() or public.is_league_season_member(p_league_season_id))
     and f.round_id = p_round_id
   order by f.kickoff_at;
$$;
