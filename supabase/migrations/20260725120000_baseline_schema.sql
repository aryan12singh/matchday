-- MatchDay v2 baseline schema.
--
-- Contract: docs/discovery/09-database-schema.md, with the addendum §D delta
-- (docs/discovery/15-owner-decisions-addendum.md) applied inline rather than as a
-- follow-up migration — there is no deployed database to migrate, so the baseline is
-- the delta-inclusive shape.
--
-- Conventions: uuid PKs defaulting to gen_random_uuid(), created_at/updated_at on
-- every table, snake_case, RLS enabled on every table (policies land in
-- 20260725120200_rls_policies.sql, functions/triggers in ..._functions_and_triggers.sql).
--
-- Deviations from the contract, all sanctioned by the document itself:
--   * `standings` uses a unique index on (stage_id, stage_group_id, team_id) with
--     NULLS NOT DISTINCT rather than the generated-column primary key sketched in §9.1;
--     the document flags that as the preferred implementation.
--   * `league_seasons.prize_scheme_id` (addendum §D) points at the *active* scheme while
--     `prize_schemes.league_season_id` remains the owning FK. That lets a league hold a
--     draft scheme without money UI appearing: the UI gate is
--     `league_seasons.prize_scheme_id is not null`, exactly as design/README.md §6 requires.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Shared: updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at. Attached to every table carrying the column.';

-- ===========================================================================
-- 9.1 Football reference domain
-- ===========================================================================

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('league', 'cup', 'hybrid', 'tournament')),
  region text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions on delete cascade,
  label text not null,
  start_date date,
  end_date date,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed')),
  is_current boolean not null default false,
  -- Cached anchor for season-market locks (table predictor, Golden Boot). Addendum §H.5:
  -- hard lock at the season's first kickoff, no grace window.
  first_kickoff_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, label)
);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons on delete cascade,
  name text not null,
  kind text not null check (kind in ('round_robin', 'groups', 'knockout')),
  sequence int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, sequence)
);

create table public.stage_groups (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages on delete cascade,
  number int not null,
  name text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'open', 'live', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stage_id, number)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  code text,
  country text,
  crest_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_season_entries (
  season_id uuid not null references public.seasons on delete cascade,
  team_id uuid not null references public.teams on delete cascade,
  stage_group_id uuid references public.stage_groups on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_id, team_id)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  known_as text,
  position text,
  birth_date date,
  nationality text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.squad_memberships (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players on delete cascade,
  team_id uuid not null references public.teams on delete cascade,
  season_id uuid not null references public.seasons on delete cascade,
  shirt_number int,
  position text,
  active_from date,
  active_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, team_id, season_id)
);
create index squad_memberships_team_season_idx on public.squad_memberships (team_id, season_id);

create table public.player_equivalences (
  canonical_player_id uuid not null references public.players on delete cascade,
  duplicate_player_id uuid not null references public.players on delete cascade,
  created_at timestamptz not null default now(),
  primary key (canonical_player_id, duplicate_player_id),
  constraint player_equivalences_distinct check (canonical_player_id <> duplicate_player_id)
);

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds on delete cascade,
  home_team_id uuid not null references public.teams,
  away_team_id uuid not null references public.teams,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled' check (status in (
    'scheduled', 'lineups', 'live', 'ht', 'finished', 'settled',
    'postponed', 'abandoned', 'awarded', 'cancelled')),
  minute int,
  home_score int,
  away_score int,
  ht_home int,
  ht_away int,
  et_home int,
  et_away int,
  pen_home int,
  pen_away int,
  leg int,
  tie_id uuid,
  venue text,
  result_confirmed_at timestamptz,
  -- Change detection for provider corrections: a differing hash triggers a rerun.
  result_hash text,
  manual_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixtures_distinct_teams check (home_team_id <> away_team_id)
);
create index fixtures_round_idx on public.fixtures (round_id);
create index fixtures_kickoff_idx on public.fixtures (kickoff_at);
create index fixtures_in_play_idx on public.fixtures (status)
  where status in ('live', 'ht', 'lineups');

create table public.fixture_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures on delete cascade,
  minute int,
  added_min int,
  period text,
  type text not null check (type in (
    'goal', 'own_goal', 'penalty_goal', 'missed_penalty',
    'yellow', 'red', 'substitution', 'var')),
  team_id uuid references public.teams,
  player_id uuid references public.players,
  assist_player_id uuid references public.players,
  detail jsonb,
  -- Idempotency key: re-ingesting the same provider event must not duplicate it.
  provider_event_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, provider_event_key)
);
create index fixture_events_fixture_minute_idx on public.fixture_events (fixture_id, minute);

create table public.fixture_lineups (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures on delete cascade,
  team_id uuid not null references public.teams,
  formation text,
  coach text,
  players jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, team_id)
);

create table public.fixture_stats (
  fixture_id uuid not null references public.fixtures on delete cascade,
  team_id uuid not null references public.teams,
  stats jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (fixture_id, team_id)
);

create table public.standings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons on delete cascade,
  stage_id uuid not null references public.stages on delete cascade,
  stage_group_id uuid references public.stage_groups on delete cascade,
  team_id uuid not null references public.teams on delete cascade,
  position int not null,
  played int,
  won int,
  drawn int,
  lost int,
  goals_for int,
  goals_against int,
  points int,
  form text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- NULLS NOT DISTINCT so a null stage_group_id (league formats) still collides correctly.
create unique index standings_stage_group_team_key
  on public.standings (stage_id, stage_group_id, team_id) nulls not distinct;
create index standings_season_position_idx on public.standings (season_id, position);

create table public.season_player_stats (
  season_id uuid not null references public.seasons on delete cascade,
  player_id uuid not null references public.players on delete cascade,
  team_id uuid references public.teams,
  goals int not null default 0,
  assists int not null default 0,
  penalties int not null default 0,
  appearances int not null default 0,
  minutes int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_id, player_id)
);
create index season_player_stats_goals_idx on public.season_player_stats (season_id, goals desc);

-- ===========================================================================
-- 9.2 Provider & sync domain
-- ===========================================================================

-- Invariant 1: application code addresses entities by internal uuid only. This table is
-- the sole place provider ids exist, and it has no client RLS policies at all.
create table public.provider_entity_map (
  provider text not null,
  entity_type text not null check (entity_type in (
    'competition', 'season', 'stage', 'round', 'fixture', 'team', 'player')),
  provider_id text not null,
  internal_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (provider, entity_type, provider_id)
);
create index provider_entity_map_reverse_idx
  on public.provider_entity_map (entity_type, internal_id);

create table public.raw_payloads (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  endpoint text not null,
  params_hash text not null,
  http_status int,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);
create index raw_payloads_endpoint_fetched_idx on public.raw_payloads (endpoint, fetched_at);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  trigger_source text not null check (trigger_source in ('tick', 'admin', 'cli', 'retry')),
  scope jsonb,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  provider text,
  records_read int not null default 0,
  records_written int not null default 0,
  error_summary text,
  details jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index sync_runs_kind_started_idx on public.sync_runs (kind, started_at desc);

create table public.provider_quota_ledger (
  provider text not null,
  day date not null,
  calls int not null default 0,
  plan_limit int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, day)
);

create table public.job_state (
  job_key text primary key,
  last_run_at timestamptz,
  last_success_at timestamptz,
  paused boolean not null default false,
  state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===========================================================================
-- 9.4 (part) Profiles — created before predictions so FKs resolve
-- ===========================================================================

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique,
  avatar_url text,
  theme text,
  colorblind boolean not null default false,
  timezone text,
  active_league_id uuid,             -- FK added after leagues exists
  is_platform_admin boolean not null default false,
  calendar_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_calendar_token_key on public.profiles (calendar_token);

-- ===========================================================================
-- 9.3 Prediction & scoring domain
-- ===========================================================================

create table public.market_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  scope text not null check (scope in ('fixture', 'round', 'season')),
  answer_schema jsonb not null,
  settler text not null,
  display jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  market_type_id uuid not null references public.market_types,
  season_id uuid not null references public.seasons on delete cascade,
  fixture_id uuid references public.fixtures on delete cascade,
  round_id uuid references public.rounds on delete cascade,
  opens_at timestamptz,
  locks_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'locked', 'settled', 'void')),
  outcome jsonb,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (market_type_id, season_id, fixture_id, round_id)
);
create index markets_fixture_idx on public.markets (fixture_id);
create index markets_open_locks_idx on public.markets (locks_at) where status = 'open';
create index markets_season_idx on public.markets (season_id);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  market_id uuid not null references public.markets on delete cascade,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, market_id)
);
create index predictions_market_idx on public.predictions (market_id);

-- Append-only audit of every pre-lock change. Written by trigger, never by clients.
create table public.prediction_revisions (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions on delete cascade,
  user_id uuid not null,
  value jsonb not null,
  recorded_at timestamptz not null default now()
);
create index prediction_revisions_prediction_idx
  on public.prediction_revisions (prediction_id, recorded_at desc);

create table public.rule_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Immutable rows (invariant 4). Guarded by a BEFORE UPDATE/DELETE trigger.
create table public.rule_set_versions (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.rule_sets on delete cascade,
  version int not null,
  engine_version text not null,
  definition jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (rule_set_id, version)
);

create table public.score_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('auto_result', 'correction', 'manual', 'backfill')),
  scope jsonb not null,
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  initiated_by uuid references auth.users on delete set null,
  stats jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index score_runs_started_idx on public.score_runs (started_at desc);

-- Phase 1 of the two-phase model: category *hits*, stored once, globally, unweighted.
create table public.score_components (
  user_id uuid not null references auth.users on delete cascade,
  market_id uuid not null references public.markets on delete cascade,
  category text not null,
  hit boolean not null,
  raw jsonb,
  rule_set_version_id uuid not null references public.rule_set_versions,
  score_run_id uuid not null references public.score_runs,
  superseded_by_run_id uuid references public.score_runs,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, market_id, category)
);
create index score_components_market_idx on public.score_components (market_id);

-- Correction audit. Immutable; a rerun that changes a hit must leave a diff row here.
create table public.score_run_changes (
  score_run_id uuid not null references public.score_runs on delete cascade,
  user_id uuid not null,
  market_id uuid not null,
  category text not null,
  old_hit boolean,
  new_hit boolean,
  old_raw jsonb,
  new_raw jsonb,
  created_at timestamptz not null default now(),
  primary key (score_run_id, user_id, market_id, category)
);

-- ===========================================================================
-- 9.4 League & social domain
-- ===========================================================================

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- High-entropy, >= 10 chars, regenerable, and hidden from non-organizers by the
  -- leagues_member_read policy operating through the public.leagues_public view.
  join_code text not null unique,
  visibility text not null default 'private' check (visibility in ('private')),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leagues_join_code_length check (char_length(join_code) >= 10)
);

create table public.league_members (
  league_id uuid not null references public.leagues on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('organizer', 'member')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index league_members_user_idx on public.league_members (user_id);

alter table public.profiles
  add constraint profiles_active_league_fk
  foreign key (active_league_id) references public.leagues on delete set null;

create table public.league_seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues on delete cascade,
  season_id uuid not null references public.seasons on delete cascade,
  reveal_policy text not null default 'at_kickoff'
    check (reveal_policy in ('at_kickoff', 'always', 'after_own_submission')),
  enabled_market_types uuid[],
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  -- Addendum §B: how this league decides which fixtures count.
  selection_mode text not null default 'all'
    check (selection_mode in ('all', 'admin_pick', 'vote')),
  -- Addendum §H.1: nullable with no default — no fixed fixtures-per-round target.
  fixtures_per_round int check (fixtures_per_round is null or fixtures_per_round > 0),
  -- Addendum §D: null = points-only league. design/README.md §6 gates ALL money UI on this.
  prize_scheme_id uuid,              -- FK added after prize_schemes exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, season_id)
);

create table public.league_rule_bindings (
  league_season_id uuid not null references public.league_seasons on delete cascade,
  rule_set_version_id uuid not null references public.rule_set_versions,
  effective_from_round int not null default 1,
  bound_at timestamptz not null default now(),
  bound_by uuid references auth.users on delete set null,
  primary key (league_season_id, effective_from_round)
);

create table public.prize_schemes (
  id uuid primary key default gen_random_uuid(),
  league_season_id uuid not null references public.league_seasons on delete cascade,
  kind text not null check (kind in ('zero_sum_rank_table', 'pot_split')),
  -- Display only. The app never moves money; this is a ledger among friends.
  currency_label text not null default '$',
  definition jsonb not null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.league_seasons
  add constraint league_seasons_prize_scheme_fk
  foreign key (prize_scheme_id) references public.prize_schemes on delete set null;

create table public.prize_settlements (
  id uuid primary key default gen_random_uuid(),
  league_season_id uuid not null references public.league_seasons on delete cascade,
  period_round_id uuid references public.rounds on delete set null,  -- null = overall
  user_id uuid not null references auth.users on delete cascade,
  amount numeric not null,
  score_run_id uuid references public.score_runs on delete set null,
  -- Corrections create revision rows chained through here; never silent edits.
  revised_from uuid references public.prize_settlements on delete set null,
  settled_at timestamptz not null default now()
);
create index prize_settlements_league_period_idx
  on public.prize_settlements (league_season_id, period_round_id);

create table public.rank_snapshots (
  id uuid primary key default gen_random_uuid(),
  league_season_id uuid not null references public.league_seasons on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  round_id uuid references public.rounds on delete set null,
  rank int not null,
  points numeric not null,
  snapshot_at timestamptz not null default now()
);
create index rank_snapshots_league_time_idx
  on public.rank_snapshots (league_season_id, snapshot_at desc);

create table public.league_events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues on delete cascade,
  type text not null,
  actor_user_id uuid references auth.users on delete set null,
  payload jsonb,
  occurred_at timestamptz not null default now()
);
create index league_events_league_time_idx on public.league_events (league_id, occurred_at desc);

create table public.rivals (
  user_id uuid not null references auth.users on delete cascade,
  league_id uuid not null references public.leagues on delete cascade,
  rival_user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, league_id, rival_user_id)
);

-- ===========================================================================
-- Addendum §D — league fixture selection & voting
-- ===========================================================================

-- The finalized truth: which fixtures count for this league in this round.
-- Invariant 7: league aggregation joins through here when selection_mode <> 'all'.
create table public.league_round_selections (
  id uuid primary key default gen_random_uuid(),
  league_season_id uuid not null references public.league_seasons on delete cascade,
  round_id uuid not null references public.rounds on delete cascade,
  fixture_id uuid not null references public.fixtures on delete cascade,
  source text not null check (source in ('admin', 'vote', 'fallback')),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_season_id, round_id, fixture_id)
);
create index league_round_selections_round_idx
  on public.league_round_selections (league_season_id, round_id);

-- Advisory votes. Tallies are visible to the league; voter identity is not (addendum §H.2),
-- which is why reads go through public.league_vote_tallies and never this table directly.
create table public.league_fixture_votes (
  league_season_id uuid not null references public.league_seasons on delete cascade,
  round_id uuid not null references public.rounds on delete cascade,
  fixture_id uuid not null references public.fixtures on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (league_season_id, round_id, fixture_id, user_id)
);
create index league_fixture_votes_round_idx
  on public.league_fixture_votes (league_season_id, round_id);

-- ===========================================================================
-- 9.5 Notifications & misc
-- ===========================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.notification_prefs (
  user_id uuid not null references auth.users on delete cascade,
  type text not null,
  channel text not null check (channel in ('push', 'email')),
  enabled boolean not null default true,
  config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, type, channel)
);

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null,
  channel text not null,
  -- Prevents double sends when a job retries.
  dedupe_key text not null unique,
  payload jsonb,
  sent_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users on delete cascade,
  action text not null,
  target jsonb,
  details jsonb,
  occurred_at timestamptz not null default now()
);
create index admin_audit_log_time_idx on public.admin_audit_log (occurred_at desc);

-- Postgres-backed fixed-window counter (§10.3) — replaces the old app's in-memory
-- bucket, which was ineffective across serverless instances.
create table public.rate_limits (
  bucket text not null,
  subject text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (bucket, subject, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);

-- ===========================================================================
-- updated_at triggers
-- ===========================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'competitions', 'seasons', 'stages', 'stage_groups', 'rounds', 'teams',
    'team_season_entries', 'players', 'squad_memberships', 'fixtures', 'fixture_events',
    'fixture_lineups', 'fixture_stats', 'standings', 'season_player_stats',
    'provider_quota_ledger', 'job_state', 'profiles', 'market_types', 'markets',
    'predictions', 'rule_sets', 'score_components', 'leagues', 'league_seasons',
    'prize_schemes', 'league_round_selections', 'notification_prefs'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end;
$$;

-- ===========================================================================
-- RLS: enabled everywhere. Policies are added in 20260725120200_rls_policies.sql;
-- until then every table denies all client access, which is the safe default.
-- ===========================================================================
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    -- ENABLE only, never FORCE: the service role and the jobs that run as it must be
    -- able to write reference data and score components. FORCE would also subject the
    -- table owner to policies, breaking migrations and seeds for no security gain here
    -- (clients never connect as the owner).
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;
