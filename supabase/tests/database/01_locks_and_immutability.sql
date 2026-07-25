-- Task 2 acceptance: "immutability + lock triggers raise as specified".
--
-- These are the regression tests for invariants 3, 4 and 5. The lock trigger is the
-- single most important control in the product: before the old app had it, a user could
-- write a prediction through PostgREST after kickoff — or after the result was published
-- — and bank the points. Everything else in the scoring pipeline assumes it holds.
--
-- Run with: supabase test db

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ---------------------------------------------------------------------------
-- Fixtures for the tests. Written as postgres (auth.uid() is null), which is exactly
-- how the service role behaves.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test');

insert into public.competitions (id, code, name, kind)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'test-league', 'Test League', 'league');

insert into public.seasons (id, competition_id, label, status, is_current)
values ('aaaaaaaa-0000-4000-8000-000000000002',
        'aaaaaaaa-0000-4000-8000-000000000001', '2026/27', 'active', true);

insert into public.stages (id, season_id, name, kind, sequence)
values ('aaaaaaaa-0000-4000-8000-000000000003',
        'aaaaaaaa-0000-4000-8000-000000000002', 'Regular Season', 'round_robin', 1);

insert into public.rounds (id, stage_id, number, name)
values ('aaaaaaaa-0000-4000-8000-000000000004',
        'aaaaaaaa-0000-4000-8000-000000000003', 1, 'Matchweek 1');

insert into public.teams (id, name, code) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'Home FC', 'HOM'),
  ('aaaaaaaa-0000-4000-8000-00000000000b', 'Away FC', 'AWY');

insert into public.fixtures (id, round_id, home_team_id, away_team_id, kickoff_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000010', 'aaaaaaaa-0000-4000-8000-000000000004',
   'aaaaaaaa-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000b',
   now() + interval '2 days'),
  ('aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000004',
   'aaaaaaaa-0000-4000-8000-00000000000b', 'aaaaaaaa-0000-4000-8000-00000000000a',
   now() - interval '2 hours');

-- An open market (locks in two days) and a market whose kickoff has passed.
insert into public.markets (id, market_type_id, season_id, fixture_id, locks_at, status)
select 'aaaaaaaa-0000-4000-8000-000000000020', mt.id,
       'aaaaaaaa-0000-4000-8000-000000000002',
       'aaaaaaaa-0000-4000-8000-000000000010',
       now() + interval '2 days', 'open'
  from public.market_types mt where mt.code = 'correct_score';

insert into public.markets (id, market_type_id, season_id, fixture_id, locks_at, status)
select 'aaaaaaaa-0000-4000-8000-000000000021', mt.id,
       'aaaaaaaa-0000-4000-8000-000000000002',
       'aaaaaaaa-0000-4000-8000-000000000011',
       now() - interval '2 hours', 'open'
  from public.market_types mt where mt.code = 'correct_score';

-- ===========================================================================
-- Seed sanity
-- ===========================================================================
select is(
  (select count(*)::int from public.market_types),
  8,
  'seed installs the eight market types (6 fixture + season table + Golden Boot)');

select is(
  (select count(*)::int from public.market_types where scope = 'season'),
  2,
  'season markets are exactly the table predictor and Golden Boot (addendum §C dropped the rest)');

select is(
  (select (definition -> 'categories' -> 'first_scorer' ->> 'weight')::int
     from public.rule_set_versions where version = 1),
  4,
  'rule set v1 carries the ported first-scorer weight of 4');

select is(
  (select (definition -> 'categories' -> 'team_goals' ->> 'weight')::int
     from public.rule_set_versions where version = 1),
  0,
  'team_goals ships settled but weighted 0, matching the old DEFAULT_WEIGHTS');

-- Signup trigger created profiles for both users.
select is(
  (select count(*)::int from public.profiles
    where id in ('11111111-1111-4111-8111-111111111111',
                 '22222222-2222-4222-8222-222222222222')),
  2,
  'handle_new_user creates a profile row on signup');

-- ===========================================================================
-- Lock trigger
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok(
  $$insert into public.predictions (user_id, market_id, value)
    values ('11111111-1111-4111-8111-111111111111',
            'aaaaaaaa-0000-4000-8000-000000000020',
            '{"home":2,"away":1}'::jsonb)$$,
  'an authenticated user may predict an open market');

select throws_ok(
  $$insert into public.predictions (user_id, market_id, value)
    values ('11111111-1111-4111-8111-111111111111',
            'aaaaaaaa-0000-4000-8000-000000000021',
            '{"home":1,"away":0}'::jsonb)$$,
  '23514',
  null,
  'the lock trigger rejects a write after locks_at has passed');

-- The obvious attack on a per-fixture deadline is to move the deadline. markets has a
-- read policy but no client write policy, so this updates zero rows rather than raising.
update public.markets set locks_at = now() + interval '30 days'
 where id = 'aaaaaaaa-0000-4000-8000-000000000021';

select ok(
  (select locks_at from public.markets
    where id = 'aaaaaaaa-0000-4000-8000-000000000021') < now(),
  'a client cannot push their own deadline out (markets have no client write policy)');

-- Editing an open prediction is allowed and writes a revision.
select lives_ok(
  $$update public.predictions set value = '{"home":3,"away":1}'::jsonb
     where user_id = '11111111-1111-4111-8111-111111111111'
       and market_id = 'aaaaaaaa-0000-4000-8000-000000000020'$$,
  'an open prediction can still be edited');

select is(
  (select count(*)::int from public.prediction_revisions
    where user_id = '11111111-1111-4111-8111-111111111111'),
  2,
  'every prediction write appends a revision (insert + update = 2)');

-- Neither of the next two raises, and that is the point worth recording: predictions and
-- prediction_revisions have no client DELETE/UPDATE policy, so RLS filters every candidate
-- row out and the statement is a silent no-op before any trigger is reached. The triggers
-- underneath are the backstop for service-role paths, tested separately below.
delete from public.predictions
 where user_id = '11111111-1111-4111-8111-111111111111';

select is(
  (select count(*)::int from public.predictions
    where user_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'a client delete removes nothing — scores are permanent');

update public.prediction_revisions set value = '{"home":9,"away":9}'::jsonb;

select is(
  (select count(*)::int from public.prediction_revisions
    where value = '{"home":9,"away":9}'::jsonb),
  0,
  'a client cannot rewrite the revision audit trail');

reset role;
reset request.jwt.claims;

-- The backstop: even a service-role path cannot rewrite the audit trail. A correction job
-- that could quietly edit revisions would make the trail worthless.
select throws_ok(
  $$update public.prediction_revisions set value = '{"home":9,"away":9}'::jsonb$$,
  '23514',
  null,
  'the immutability trigger stops a service-role rewrite of the audit trail');

-- ===========================================================================
-- The service role (auth.uid() is null) bypasses the lock, as settlement requires.
-- ===========================================================================
select lives_ok(
  $$insert into public.predictions (user_id, market_id, value)
    values ('22222222-2222-4222-8222-222222222222',
            'aaaaaaaa-0000-4000-8000-000000000021',
            '{"home":0,"away":0}'::jsonb)$$,
  'a backend write with no authenticated user bypasses the lock');

-- ===========================================================================
-- Immutability guards
-- ===========================================================================
select throws_ok(
  $$update public.rule_set_versions set engine_version = '9.9.9' where version = 1$$,
  '23514',
  null,
  'rule_set_versions rows are immutable (invariant 4)');

select throws_ok(
  $$delete from public.rule_set_versions where version = 1$$,
  '23514',
  null,
  'rule_set_versions rows cannot be deleted');

insert into public.score_runs (id, trigger, scope)
values ('aaaaaaaa-0000-4000-8000-000000000030', 'auto_result', '{"fixture_id":"x"}'::jsonb);

insert into public.score_run_changes
  (score_run_id, user_id, market_id, category, old_hit, new_hit)
values ('aaaaaaaa-0000-4000-8000-000000000030',
        '11111111-1111-4111-8111-111111111111',
        'aaaaaaaa-0000-4000-8000-000000000020', 'outcome', false, true);

select throws_ok(
  $$update public.score_run_changes set new_hit = false$$,
  '23514',
  null,
  'correction diffs are immutable (invariant 5)');

-- ===========================================================================
-- lock_markets_sweep
-- ===========================================================================
select is(
  public.lock_markets_sweep(),
  1,
  'the sweep locks exactly the market whose kickoff has passed');

select is(
  (select status from public.markets where id = 'aaaaaaaa-0000-4000-8000-000000000021'),
  'locked',
  'the passed-kickoff market is now locked');

select is(
  (select status from public.markets where id = 'aaaaaaaa-0000-4000-8000-000000000020'),
  'open',
  'the future market is untouched by the sweep');

-- A market that the sweep has not yet reached is still closed at exactly locks_at:
-- the trigger checks locks_at independently of status.
update public.markets set status = 'open'
 where id = 'aaaaaaaa-0000-4000-8000-000000000021';

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select throws_ok(
  $$insert into public.predictions (user_id, market_id, value)
    values ('11111111-1111-4111-8111-111111111111',
            'aaaaaaaa-0000-4000-8000-000000000021',
            '{"home":1,"away":1}'::jsonb)$$,
  '23514',
  null,
  'a market past locks_at is closed even before the sweep flips its status');

reset role;
reset request.jwt.claims;

-- ===========================================================================
-- Invariant 7 — league_round_fixtures never returns an empty round
-- ===========================================================================
insert into public.leagues (id, name, join_code, created_by)
values ('aaaaaaaa-0000-4000-8000-000000000040', 'The Boot Room', 'BOOTROOM01',
        '11111111-1111-4111-8111-111111111111');

insert into public.league_members (league_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000040', '11111111-1111-4111-8111-111111111111', 'organizer'),
  ('aaaaaaaa-0000-4000-8000-000000000040', '22222222-2222-4222-8222-222222222222', 'member');

insert into public.league_seasons (id, league_id, season_id, selection_mode)
values ('aaaaaaaa-0000-4000-8000-000000000041',
        'aaaaaaaa-0000-4000-8000-000000000040',
        'aaaaaaaa-0000-4000-8000-000000000002', 'vote');

select is(
  (select count(*)::int from public.league_round_fixtures(
     'aaaaaaaa-0000-4000-8000-000000000041', 'aaaaaaaa-0000-4000-8000-000000000004')),
  2,
  'with nothing finalized, every fixture in the round counts (the §B fallback)');

insert into public.league_round_selections
  (league_season_id, round_id, fixture_id, source, finalized_at)
values ('aaaaaaaa-0000-4000-8000-000000000041',
        'aaaaaaaa-0000-4000-8000-000000000004',
        'aaaaaaaa-0000-4000-8000-000000000010', 'admin', now());

select is(
  (select count(*)::int from public.league_round_fixtures(
     'aaaaaaaa-0000-4000-8000-000000000041', 'aaaaaaaa-0000-4000-8000-000000000004')),
  1,
  'once finalized, only the selected fixtures count');

-- ===========================================================================
-- Addendum §B — votes are rejected after finalization
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select throws_ok(
  $$insert into public.league_fixture_votes
      (league_season_id, round_id, fixture_id, user_id)
    values ('aaaaaaaa-0000-4000-8000-000000000041',
            'aaaaaaaa-0000-4000-8000-000000000004',
            'aaaaaaaa-0000-4000-8000-000000000011',
            '22222222-2222-4222-8222-222222222222')$$,
  '23514',
  null,
  'vote writes are rejected at the database once the round is finalized (invariant 7)');

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
