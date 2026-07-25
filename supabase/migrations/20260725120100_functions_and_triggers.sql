-- Critical database logic — docs/discovery/09-database-schema.md §9.6.
--
-- The prediction lock trigger is a direct port of the old repo's
-- ../wc26-predictor/supabase/migrations/20260624000000_lock_prediction_writes.sql,
-- retargeted from `matches` to `markets`. Its original comment explains why this must
-- live in the database: until it existed, the deadline was enforced only in the browser,
-- so a user could write a prediction through PostgREST after kickoff — or after the
-- result was published — and bank the points. UI enforcement is convenience; this is the
-- control (invariant 3).

set check_function_bodies = off;

-- ===========================================================================
-- Authorization helpers (SECURITY DEFINER so policies can call them without
-- recursing into the very tables whose policies invoke them).
-- ===========================================================================

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = auth.uid()),
    false);
$$;

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.league_members lm
     where lm.league_id = p_league_id and lm.user_id = auth.uid());
$$;

create or replace function public.is_league_organizer(p_league_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.league_members lm
     where lm.league_id = p_league_id
       and lm.user_id = auth.uid()
       and lm.role = 'organizer');
$$;

create or replace function public.is_league_season_member(p_league_season_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.league_seasons ls
      join public.league_members lm on lm.league_id = ls.league_id
     where ls.id = p_league_season_id and lm.user_id = auth.uid());
$$;

create or replace function public.is_league_season_organizer(p_league_season_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.league_seasons ls
      join public.league_members lm on lm.league_id = ls.league_id
     where ls.id = p_league_season_id
       and lm.user_id = auth.uid()
       and lm.role = 'organizer');
$$;

-- ---------------------------------------------------------------------------
-- can_view_prediction — the reveal rule, §10.2.
--
-- You always see your own. You see someone else's only when the market is no longer
-- open (locked/settled/void) AND you share a league whose reveal_policy permits it:
--
--   at_kickoff             -> visible once the market is locked (the common case)
--   always                 -> visible once locked, to that league's members
--   after_own_submission   -> additionally requires that YOU predicted this market
--
-- Note that no policy exposes an OPEN market's predictions. 'always' means "always once
-- play has started", not "before kickoff" — pre-lock exposure would let a league mate
-- copy picks, which is the single thing the threat model in §10 cares most about.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_prediction(p_market_id uuid, p_owner_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_viewer uuid := auth.uid();
  v_status text;
begin
  if v_viewer is null then
    return false;
  end if;
  if v_viewer = p_owner_id then
    return true;
  end if;

  select m.status into v_status from public.markets m where m.id = p_market_id;
  if v_status is null or v_status = 'open' then
    return false;
  end if;

  return exists (
    select 1
      from public.league_members viewer
      join public.league_members owner
        on owner.league_id = viewer.league_id
      join public.league_seasons ls
        on ls.league_id = viewer.league_id
      join public.markets m
        on m.id = p_market_id and m.season_id = ls.season_id
     where viewer.user_id = v_viewer
       and owner.user_id = p_owner_id
       and (
         ls.reveal_policy in ('at_kickoff', 'always')
         or (
           ls.reveal_policy = 'after_own_submission'
           and exists (
             select 1 from public.predictions own
              where own.market_id = p_market_id and own.user_id = v_viewer)
         )
       ));
end;
$$;

-- ===========================================================================
-- §9.6.1 — enforce_prediction_lock (ported)
-- ===========================================================================
create or replace function public.enforce_prediction_lock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m record;
begin
  -- Service-role / backend writes (settlement, sync, corrections) have no
  -- authenticated end user and must still be able to write after kickoff.
  if auth.uid() is null then
    return new;
  end if;

  select mk.locks_at, mk.status
    into m
    from public.markets mk
   where mk.id = new.market_id;

  if not found then
    raise exception 'prediction references an unknown market'
      using errcode = 'foreign_key_violation';
  end if;

  if m.status <> 'open' then
    raise exception 'predictions are locked for this market (status=%)', m.status
      using errcode = 'check_violation';
  end if;

  -- Hard lock keyed to kickoff. Addendum §H.5: no grace window, no late entries.
  -- Checked independently of status so a market whose lock sweep has not yet run is
  -- still closed at exactly locks_at.
  if m.locks_at <= now() then
    raise exception 'predictions are locked for this market (locked at %)', m.locks_at
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_prediction_lock
  before insert or update on public.predictions
  for each row execute function public.enforce_prediction_lock();

-- Predictions are permanent: there is no client delete policy, and this makes the
-- intent explicit for any future path that acquires one.
create or replace function public.reject_prediction_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return old;
  end if;
  raise exception 'predictions cannot be deleted'
    using errcode = 'check_violation';
end;
$$;

create trigger trg_reject_prediction_delete
  before delete on public.predictions
  for each row execute function public.reject_prediction_delete();

-- ===========================================================================
-- §9.6.2 — record_prediction_revision (append-only audit)
-- ===========================================================================
create or replace function public.record_prediction_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.prediction_revisions (prediction_id, user_id, value)
  values (new.id, new.user_id, new.value);
  return new;
end;
$$;

create trigger trg_record_prediction_revision
  after insert or update of value on public.predictions
  for each row execute function public.record_prediction_revision();

-- Revisions are append-only for everyone, including the service role: the audit trail
-- is worthless if a correction job can quietly rewrite it.
create or replace function public.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are immutable (attempted %)', tg_table_name, tg_op
    using errcode = 'check_violation';
end;
$$;

create trigger trg_prediction_revisions_immutable
  before update or delete on public.prediction_revisions
  for each row execute function public.reject_mutation();

-- ===========================================================================
-- §9.6.6 — immutability guards
-- ===========================================================================
create trigger trg_rule_set_versions_immutable
  before update or delete on public.rule_set_versions
  for each row execute function public.reject_mutation();

create trigger trg_score_run_changes_immutable
  before update or delete on public.score_run_changes
  for each row execute function public.reject_mutation();

-- ===========================================================================
-- §9.6.4 — lock_markets_sweep
-- Invoked by the tick. Reveal policies key off market status, so this is what makes
-- "visible at kickoff" happen on server time rather than client time.
-- ===========================================================================
create or replace function public.lock_markets_sweep()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  update public.markets
     set status = 'locked'
   where status = 'open'
     and locks_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ===========================================================================
-- §9.6.3 — join_league (ported pattern)
-- ===========================================================================
create or replace function public.join_league(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_league_id uuid;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'must be signed in to join a league'
      using errcode = 'insufficient_privilege';
  end if;

  select l.id into v_league_id
    from public.leagues l
   where upper(l.join_code) = upper(btrim(p_code));

  if v_league_id is null then
    -- Deliberately identical to the "already a member" path below in shape and cost, so
    -- the response cannot be used to enumerate valid codes. Rate limiting on the calling
    -- route (§10.3) is the other half of this.
    raise exception 'invalid join code'
      using errcode = 'no_data_found';
  end if;

  insert into public.league_members (league_id, user_id, role)
  values (v_league_id, v_user, 'member')
  on conflict (league_id, user_id) do nothing;

  return v_league_id;
end;
$$;

revoke all on function public.join_league(text) from public;
grant execute on function public.join_league(text) to authenticated;

-- Join-flow preview: name and member count for a valid code, nothing else, and never
-- the code itself. Replaces the old app's "authenticated read all leagues" policy.
create or replace function public.preview_league(p_code text)
returns table (league_id uuid, name text, member_count bigint)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select l.id,
         l.name,
         (select count(*) from public.league_members lm where lm.league_id = l.id)
    from public.leagues l
   where upper(l.join_code) = upper(btrim(p_code))
   limit 1;
$$;

revoke all on function public.preview_league(text) from public;
grant execute on function public.preview_league(text) to authenticated;

-- ===========================================================================
-- Addendum §B — voting guards
-- ===========================================================================

-- Invariant 7: vote writes are rejected at the database once the round is finalized.
create or replace function public.enforce_vote_window()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_league_season_id uuid := coalesce(new.league_season_id, old.league_season_id);
  v_round_id uuid := coalesce(new.round_id, old.round_id);
  v_mode text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  select ls.selection_mode into v_mode
    from public.league_seasons ls
   where ls.id = v_league_season_id;

  if v_mode is distinct from 'vote' then
    raise exception 'this league does not use fixture voting'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.league_round_selections s
     where s.league_season_id = v_league_season_id
       and s.round_id = v_round_id
       and s.finalized_at is not null)
  then
    raise exception 'selections for this round are already finalized'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_enforce_vote_window
  before insert or delete on public.league_fixture_votes
  for each row execute function public.enforce_vote_window();

-- Anonymised tallies. Addendum §H.2: the league sees counts, never who voted.
--
-- This view must run with DEFINER rights (security_invoker = false). Under invoker
-- rights the caller's own RLS on league_fixture_votes applies first — they can only see
-- their own vote row — so every tally would read 1. Definer rights let it aggregate the
-- whole round while the WHERE clause restricts the result to leagues the caller actually
-- belongs to, and no user_id is ever projected. security_barrier stops the planner
-- pushing a user-supplied predicate inside the aggregate, which in a small league could
-- otherwise re-identify a voter.
create or replace view public.league_vote_tallies
with (security_barrier = true, security_invoker = false)
as
  select v.league_season_id,
         v.round_id,
         v.fixture_id,
         count(*)::int as votes
    from public.league_fixture_votes v
   where public.is_league_season_member(v.league_season_id)
   group by v.league_season_id, v.round_id, v.fixture_id;

comment on view public.league_vote_tallies is
  'Per-fixture vote counts for a league round. Voter identity is never exposed (addendum §H.2).';

-- ---------------------------------------------------------------------------
-- Effective selection for a league round.
--
-- Invariant 7 in one place, so aggregation, the predict screen and the settlement
-- engine cannot drift apart:
--   * selection_mode = 'all'      -> every fixture in the round
--   * finalized selections exist  -> exactly those
--   * otherwise                   -> fallback to every fixture in the round
-- The fallback covers the addendum §B guarantee that an unfinalized round 24h before
-- its first kickoff counts everything; the job that stamps it is Task 21's, but the
-- read path must be safe before that job ever runs.
-- ---------------------------------------------------------------------------
create or replace function public.league_round_fixtures(
  p_league_season_id uuid,
  p_round_id uuid
)
returns table (fixture_id uuid)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with mode as (
    select ls.selection_mode
      from public.league_seasons ls
     where ls.id = p_league_season_id
  ),
  finalized as (
    select s.fixture_id
      from public.league_round_selections s
     where s.league_season_id = p_league_season_id
       and s.round_id = p_round_id
       and s.finalized_at is not null
  )
  select f.id
    from public.fixtures f
   where f.round_id = p_round_id
     and (
       (select selection_mode from mode) = 'all'
       or not exists (select 1 from finalized)
       or f.id in (select fixture_id from finalized)
     );
$$;

comment on function public.league_round_fixtures(uuid, uuid) is
  'The fixtures that count for a league in a round (invariant 7). Falls back to all fixtures when nothing is finalized, so a round can never be empty.';

-- ===========================================================================
-- Signup: create the profile row automatically (§14.2 task 3 AC).
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_username text;
  v_suffix int := 0;
begin
  v_username := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
    split_part(new.email, '@', 1),
    'player');
  v_username := regexp_replace(lower(v_username), '[^a-z0-9_.-]', '', 'g');
  if char_length(v_username) < 3 then
    v_username := 'player';
  end if;
  v_username := left(v_username, 24);

  -- Usernames are unique; append a counter rather than failing the signup.
  while exists (select 1 from public.profiles p where p.username = v_username) loop
    v_suffix := v_suffix + 1;
    v_username := left(v_username, 20) || v_suffix::text;
  end loop;

  insert into public.profiles (id, username)
  values (new.id, v_username)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();
