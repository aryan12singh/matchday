-- Leaderboard reads.
--
-- These functions return raw *hits*, filtered to the markets that count for the league
-- (invariant 7). They deliberately do not apply weights or compute totals: valuation is
-- phase 2 and lives in packages/scoring, so one implementation of the tiebreak chain
-- serves the board, the recap and any future view, and stays unit-testable without a
-- database.
--
-- Filtering here rather than in TypeScript is not an optimisation — it is where the
-- selection join belongs. Shipping every component to the app and filtering there would
-- mean every caller had to remember invariant 7, and one that forgot would silently
-- score fixtures the league never selected.

set check_function_bodies = off;

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
   where public.is_league_season_member(p_league_season_id)
     and m.season_id = ls.season_id
     and (p_round_id is null or r.id = p_round_id)
     -- Invariant 7: only this league's selected fixtures count.
     and f.id in (select fixture_id from public.league_round_fixtures(p_league_season_id, r.id))
     -- Season markets are excluded: the table predictor is a separate competition
     -- (invariant 8) and Golden Boot settles at season end.
     and m.fixture_id is not null;
$$;

revoke all on function public.league_score_components(uuid, uuid) from public;
grant execute on function public.league_score_components(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The weights a league is scoring under for a given round.
--
-- A league can span rule-set versions with a clean cut line, so the binding that applies
-- is the latest one whose effective_from_round is at or before the round in question.
-- ---------------------------------------------------------------------------
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
     and public.is_league_season_member(p_league_season_id)
   order by b.effective_from_round desc
   limit 1;
$$;

revoke all on function public.league_weights(uuid, int) from public;
grant execute on function public.league_weights(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Table race: every member's season-table prediction against the current table.
--
-- Returns the raw orders and lets packages/scoring do the diffing, for the same reason
-- as above — scoreSeasonTable() is already the tested implementation of "lowest wins".
-- ---------------------------------------------------------------------------
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
  select p.user_id,
         pr.username,
         lm.joined_at,
         p.value -> 'order'
    from public.predictions p
    join public.markets m on m.id = p.market_id
    join public.market_types mt on mt.id = m.market_type_id
    join public.league_seasons ls on ls.id = p_league_season_id and ls.season_id = m.season_id
    join public.league_members lm on lm.league_id = ls.league_id and lm.user_id = p.user_id
    join public.profiles pr on pr.id = p.user_id
   where public.is_league_season_member(p_league_season_id)
     and mt.code = 'season_table'
     -- Never expose an unlocked entry: before the season starts these are live picks and
     -- showing them would let a member copy the best-informed guess.
     and m.status <> 'open';
$$;

revoke all on function public.table_race_entries(uuid) from public;
grant execute on function public.table_race_entries(uuid) to authenticated;

-- The current league table, for "if the season ended today" tracking.
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

revoke all on function public.current_table_order(uuid) from public;
grant execute on function public.current_table_order(uuid) to authenticated;
