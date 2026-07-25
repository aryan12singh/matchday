# 9. Proposed Database Schema (Postgres / Supabase)

Baseline migration for v2. Conventions: `uuid` PKs (`gen_random_uuid()`), `created_at/updated_at timestamptz default now()` everywhere (not repeated below), snake_case, RLS enabled on every table (policies in `10-security-and-rls.md`). `-- ▲` marks indexes that matter. This is the contract for Claude Code — column-level deviations should be argued in PR descriptions.

## 9.1 Football reference domain

```sql
create table competitions (
  id uuid primary key,
  code text not null unique,            -- 'premier-league'
  name text not null,
  kind text not null check (kind in ('league','cup','hybrid','tournament')),
  region text,                          -- 'England', 'Europe', 'World'
  logo_url text
);

create table seasons (
  id uuid primary key,
  competition_id uuid not null references competitions on delete cascade,
  label text not null,                  -- '2026/27'
  start_date date, end_date date,
  status text not null default 'upcoming' check (status in ('upcoming','active','completed')),
  is_current boolean not null default false,
  first_kickoff_at timestamptz,         -- cached; season-market lock anchor
  unique (competition_id, label)
);

create table stages (
  id uuid primary key,
  season_id uuid not null references seasons on delete cascade,
  name text not null,                   -- 'Regular Season', 'League Phase', 'Knockout'
  kind text not null check (kind in ('round_robin','groups','knockout')),
  sequence int not null,
  unique (season_id, sequence)
);

create table stage_groups (              -- only for kind='groups'
  id uuid primary key,
  stage_id uuid not null references stages on delete cascade,
  name text not null                     -- 'Group A'
);

create table rounds (
  id uuid primary key,
  stage_id uuid not null references stages on delete cascade,
  number int not null,
  name text not null,                    -- 'Matchweek 14'
  starts_at timestamptz, ends_at timestamptz,   -- derived cache
  status text not null default 'scheduled' check (status in ('scheduled','open','live','completed')),
  unique (stage_id, number)
);

create table teams (
  id uuid primary key,
  name text not null, short_name text, code text,     -- 'ARS'
  country text, crest_url text
);

create table team_season_entries (
  season_id uuid not null references seasons on delete cascade,
  team_id uuid not null references teams on delete cascade,
  stage_group_id uuid references stage_groups,
  primary key (season_id, team_id)
);

create table players (
  id uuid primary key,
  full_name text not null, known_as text,
  position text, birth_date date, nationality text, photo_url text
);

create table squad_memberships (
  id uuid primary key,
  player_id uuid not null references players on delete cascade,
  team_id uuid not null references teams on delete cascade,
  season_id uuid not null references seasons on delete cascade,
  shirt_number int, position text,
  active_from date, active_until date,
  unique (player_id, team_id, season_id)
);
create index on squad_memberships (team_id, season_id);   -- ▲ squad pickers

create table player_equivalences (       -- manual/provider dedup merges
  canonical_player_id uuid not null references players,
  duplicate_player_id uuid not null references players,
  primary key (canonical_player_id, duplicate_player_id)
);

create table fixtures (
  id uuid primary key,
  round_id uuid not null references rounds on delete cascade,
  home_team_id uuid not null references teams,
  away_team_id uuid not null references teams,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled' check (status in
    ('scheduled','lineups','live','ht','finished','settled',
     'postponed','abandoned','awarded','cancelled')),
  minute int,
  home_score int, away_score int,        -- current/full-time (regulation focus)
  ht_home int, ht_away int,
  et_home int, et_away int, pen_home int, pen_away int,
  leg int, tie_id uuid,                  -- knockout support
  venue text,
  result_confirmed_at timestamptz,
  result_hash text,                      -- change detection for corrections
  manual_override boolean not null default false
);
create index on fixtures (round_id);                          -- ▲
create index on fixtures (kickoff_at);                        -- ▲ tick windows
create index on fixtures (status) where status in ('live','ht','lineups'); -- ▲

create table fixture_events (
  id uuid primary key,
  fixture_id uuid not null references fixtures on delete cascade,
  minute int, added_min int, period text,
  type text not null check (type in ('goal','own_goal','penalty_goal','missed_penalty',
                                     'yellow','red','substitution','var')),
  team_id uuid references teams,
  player_id uuid references players,
  assist_player_id uuid references players,
  detail jsonb,
  provider_event_key text,               -- idempotency
  unique (fixture_id, provider_event_key)
);
create index on fixture_events (fixture_id, minute);          -- ▲

create table fixture_lineups (
  id uuid primary key,
  fixture_id uuid not null references fixtures on delete cascade,
  team_id uuid not null references teams,
  formation text,
  coach text,
  players jsonb not null,                -- [{player_id, number, position, grid, starter}]
  unique (fixture_id, team_id)
);

create table fixture_stats (
  fixture_id uuid not null references fixtures on delete cascade,
  team_id uuid not null references teams,
  stats jsonb not null,                  -- {possession, shots, on_target, xg, corners, ...}
  primary key (fixture_id, team_id)
);

create table standings (
  season_id uuid not null references seasons on delete cascade,
  stage_id uuid not null references stages on delete cascade,
  stage_group_id uuid references stage_groups,
  team_id uuid not null references teams,
  position int not null, played int, won int, drawn int, lost int,
  goals_for int, goals_against int, points int, form text,
  primary key (stage_id, coalesce_group uuid generated always as (coalesce(stage_group_id,'00000000-0000-0000-0000-000000000000'::uuid)) stored, team_id)
);
-- (implementation may prefer a plain unique index on (stage_id, stage_group_id, team_id) with nulls not distinct)

create table season_player_stats (       -- Golden Boot table + season-market tracking
  season_id uuid not null references seasons on delete cascade,
  player_id uuid not null references players on delete cascade,
  team_id uuid references teams,
  goals int default 0, assists int default 0, penalties int default 0,
  appearances int default 0, minutes int default 0,
  primary key (season_id, player_id)
);
```

## 9.2 Provider & sync domain

```sql
create table provider_entity_map (
  provider text not null,                -- 'api-football'
  entity_type text not null,            -- 'fixture','team','player','season','round','competition'
  provider_id text not null,
  internal_id uuid not null,
  primary key (provider, entity_type, provider_id)
);
create index on provider_entity_map (entity_type, internal_id);  -- ▲ reverse lookup

create table raw_payloads (
  id uuid primary key,
  provider text not null, endpoint text not null, params_hash text not null,
  http_status int, payload jsonb not null,
  fetched_at timestamptz not null default now()
);
create index on raw_payloads (endpoint, fetched_at);             -- ▲ retention + replay

create table sync_runs (                  -- port + extend old lib/sync-runs.ts
  id uuid primary key,
  kind text not null,                     -- job catalog codes
  trigger_source text not null check (trigger_source in ('tick','admin','cli','retry')),
  scope jsonb,
  status text not null default 'running' check (status in ('running','success','partial','failed')),
  provider text,
  records_read int default 0, records_written int default 0,
  error_summary text, details jsonb,
  started_at timestamptz default now(), finished_at timestamptz
);
create index on sync_runs (kind, started_at desc);               -- ▲ /ops health board

create table provider_quota_ledger (
  provider text not null, day date not null,
  calls int not null default 0, plan_limit int,
  primary key (provider, day)
);

create table job_state (                  -- tick controller memory
  job_key text primary key,               -- 'sync_live:PL-2026'
  last_run_at timestamptz, last_success_at timestamptz,
  paused boolean not null default false,
  state jsonb                             -- cursors for chunked backfills
);
```

## 9.3 Prediction & scoring domain

```sql
create table market_types (
  id uuid primary key,
  code text not null unique,              -- 'correct_score', 'season_champion', ...
  scope text not null check (scope in ('fixture','round','season')),
  answer_schema jsonb not null,
  settler text not null,                  -- settlement function name (code registry)
  display jsonb,
  active boolean not null default true
);

create table markets (
  id uuid primary key,
  market_type_id uuid not null references market_types,
  season_id uuid not null references seasons,
  fixture_id uuid references fixtures on delete cascade,   -- when scope='fixture'
  round_id uuid references rounds on delete cascade,       -- when scope='round'
  opens_at timestamptz, locks_at timestamptz not null,
  status text not null default 'open' check (status in ('open','locked','settled','void')),
  outcome jsonb, settled_at timestamptz,
  unique (market_type_id, season_id, fixture_id, round_id)  -- nulls not distinct semantics
);
create index on markets (fixture_id);                         -- ▲
create index on markets (locks_at) where status = 'open';     -- ▲ lock sweeps + reminders

create table predictions (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  market_id uuid not null references markets on delete cascade,
  value jsonb not null,
  unique (user_id, market_id)
);
create index on predictions (market_id);                      -- ▲ settlement scans

create table prediction_revisions (       -- append-only audit
  id uuid primary key,
  prediction_id uuid not null references predictions on delete cascade,
  user_id uuid not null,
  value jsonb not null,
  recorded_at timestamptz not null default now()
);

create table rule_sets (
  id uuid primary key, name text not null, description text
);

create table rule_set_versions (          -- immutable rows
  id uuid primary key,
  rule_set_id uuid not null references rule_sets,
  version int not null,
  engine_version text not null,           -- settlement library semver
  definition jsonb not null,              -- {categories:{outcome:{enabled,weight},...}, tiebreaks:[...]}
  notes text,
  unique (rule_set_id, version)
);

create table score_runs (
  id uuid primary key,
  trigger text not null check (trigger in ('auto_result','correction','manual','backfill')),
  scope jsonb not null,
  status text not null default 'running' check (status in ('running','success','failed')),
  initiated_by uuid references auth.users,
  stats jsonb, error text,
  started_at timestamptz default now(), finished_at timestamptz
);

create table score_components (
  user_id uuid not null references auth.users on delete cascade,
  market_id uuid not null references markets on delete cascade,
  category text not null,                 -- 'outcome','exact','goal_diff',...
  hit boolean not null,
  raw jsonb,
  rule_set_version_id uuid not null references rule_set_versions,
  score_run_id uuid not null references score_runs,
  primary key (user_id, market_id, category)
);
create index on score_components (market_id);                 -- ▲ per-fixture views

create table score_run_changes (          -- correction audit (diff log)
  score_run_id uuid not null references score_runs on delete cascade,
  user_id uuid not null, market_id uuid not null, category text not null,
  old_hit boolean, new_hit boolean, old_raw jsonb, new_raw jsonb,
  primary key (score_run_id, user_id, market_id, category)
);

create table rank_snapshots (             -- port
  id uuid primary key,
  league_season_id uuid not null,         -- FK added below
  user_id uuid not null,
  round_id uuid references rounds,
  rank int not null, points numeric not null,
  snapshot_at timestamptz not null default now()
);
create index on rank_snapshots (league_season_id, snapshot_at desc);  -- ▲
```

## 9.4 League & social domain

```sql
create table profiles (                   -- port shape from old app
  id uuid primary key references auth.users on delete cascade,
  username text not null unique,
  avatar_url text, theme text, colorblind boolean default false,
  timezone text,
  active_league_id uuid,                  -- FK to leagues, added after
  is_platform_admin boolean not null default false,
  calendar_token uuid not null default gen_random_uuid()
);

create table leagues (
  id uuid primary key,
  name text not null,
  join_code text not null unique,         -- generated server-side; read-restricted
  visibility text not null default 'private' check (visibility in ('private')),  -- 'public' later
  created_by uuid references auth.users on delete set null
);

create table league_members (
  league_id uuid not null references leagues on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('organizer','member')),
  joined_at timestamptz default now(),
  primary key (league_id, user_id)
);
create index on league_members (user_id);                     -- ▲

create table league_seasons (             -- league enrolls in competition seasons
  id uuid primary key,
  league_id uuid not null references leagues on delete cascade,
  season_id uuid not null references seasons on delete cascade,
  reveal_policy text not null default 'at_kickoff'
    check (reveal_policy in ('at_kickoff','always','after_own_submission')),
  enabled_market_types uuid[] ,           -- null = rule-set default set
  status text not null default 'active' check (status in ('active','completed','archived')),
  unique (league_id, season_id)
);

create table league_rule_bindings (
  league_season_id uuid not null references league_seasons on delete cascade,
  rule_set_version_id uuid not null references rule_set_versions,
  effective_from_round int not null default 1,
  bound_at timestamptz default now(),
  bound_by uuid references auth.users,
  primary key (league_season_id, effective_from_round)
);

create table prize_schemes (
  id uuid primary key,
  league_season_id uuid not null references league_seasons on delete cascade,
  kind text not null check (kind in ('zero_sum_rank_table','pot_split')),
  currency_label text not null default '$',
  definition jsonb not null,
  activated_at timestamptz
);

create table prize_settlements (
  id uuid primary key,
  league_season_id uuid not null references league_seasons on delete cascade,
  period_round_id uuid references rounds,   -- null = overall
  user_id uuid not null references auth.users,
  amount numeric not null,
  score_run_id uuid references score_runs,
  revised_from uuid references prize_settlements,
  settled_at timestamptz default now()
);

create table league_events (               -- activity feed (port)
  id uuid primary key,
  league_id uuid not null references leagues on delete cascade,
  type text not null,                      -- 'member_joined','round_settled','rank_change',...
  actor_user_id uuid, payload jsonb,
  occurred_at timestamptz default now()
);
create index on league_events (league_id, occurred_at desc);   -- ▲

create table rivals (
  user_id uuid not null references auth.users on delete cascade,
  league_id uuid not null references leagues on delete cascade,
  rival_user_id uuid not null references auth.users on delete cascade,
  primary key (user_id, league_id, rival_user_id)
);
```

## 9.5 Notifications & misc

```sql
create table push_subscriptions (          -- port
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique, keys jsonb not null,
  user_agent text, created_at timestamptz default now()
);

create table notification_prefs (
  user_id uuid not null references auth.users on delete cascade,
  type text not null,                      -- 'deadline_reminder','lineups_posted',...
  channel text not null check (channel in ('push','email')),
  enabled boolean not null default true,
  config jsonb,                            -- {lead_minutes: 180}
  primary key (user_id, type, channel)
);

create table notification_log (
  id uuid primary key,
  user_id uuid not null, type text not null, channel text not null,
  dedupe_key text not null unique,         -- prevents double sends on retried jobs
  payload jsonb, sent_at timestamptz default now()
);

create table admin_audit_log (
  id uuid primary key,
  actor_user_id uuid not null,
  action text not null, target jsonb, details jsonb,
  occurred_at timestamptz default now()
);
```

## 9.6 Critical database logic (triggers/functions, ported patterns)

1. **`enforce_prediction_lock()`** — BEFORE INSERT/UPDATE on `predictions` and `prediction_revisions`: reject when the market's `locks_at <= now()` or market status ≠ 'open' *and* `auth.uid()` is not null (service role bypasses). Direct generalization of old migration `20260624000000_lock_prediction_writes.sql` — its comment documents why this must be DB-level.
2. **`record_prediction_revision()`** — AFTER INSERT/UPDATE on `predictions`: append to `prediction_revisions`.
3. **`join_league(p_code text)`** — SECURITY DEFINER, validates code + inserts membership (port of old `join_league`).
4. **`lock_markets_sweep()`** — invoked by tick: set `status='locked'` where `locks_at <= now()` (reveal policies key off this, not off client time).
5. **`is_platform_admin()` / `is_league_organizer(league_id)`** — SECURITY DEFINER helpers for policies (pattern from old `is_admin()`).
6. **Immutability guard** on `rule_set_versions` and `score_run_changes`: BEFORE UPDATE/DELETE → raise exception.
7. **Realtime publications** limited to: `fixtures` (live columns), `fixture_events`, `league_events` — nothing prediction-related pre-lock.
