-- Task 12 acceptance: "security tests green in CI" for §10.4 items 1, 2 and 6, exercised
-- through the composite save function the app actually calls.
--
-- The point of most of these: save_fixture_prediction is SECURITY INVOKER, so it is not a
-- lock bypass. If someone ever changes it to DEFINER to "fix" a permissions error, these
-- fail loudly.

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test');

insert into public.competitions (id, code, name, kind)
values ('eeeeeeee-0000-4000-8000-000000000001', 'pl', 'Premier League', 'league');
insert into public.seasons (id, competition_id, label, status, is_current)
values ('eeeeeeee-0000-4000-8000-000000000002',
        'eeeeeeee-0000-4000-8000-000000000001', '2026/27', 'active', true);
insert into public.stages (id, season_id, name, kind, sequence)
values ('eeeeeeee-0000-4000-8000-000000000003',
        'eeeeeeee-0000-4000-8000-000000000002', 'Regular Season', 'round_robin', 1);
insert into public.rounds (id, stage_id, number, name)
values ('eeeeeeee-0000-4000-8000-000000000004',
        'eeeeeeee-0000-4000-8000-000000000003', 1, 'Matchweek 1');
insert into public.teams (id, name, code) values
  ('eeeeeeee-0000-4000-8000-00000000000a', 'Home FC', 'HOM'),
  ('eeeeeeee-0000-4000-8000-00000000000b', 'Away FC', 'AWY');
insert into public.players (id, full_name) values
  ('eeeeeeee-0000-4000-8000-0000000000f1', 'A Striker');

insert into public.fixtures (id, round_id, home_team_id, away_team_id, kickoff_at) values
  ('eeeeeeee-0000-4000-8000-000000000010', 'eeeeeeee-0000-4000-8000-000000000004',
   'eeeeeeee-0000-4000-8000-00000000000a', 'eeeeeeee-0000-4000-8000-00000000000b',
   now() + interval '2 days'),
  ('eeeeeeee-0000-4000-8000-000000000011', 'eeeeeeee-0000-4000-8000-000000000004',
   'eeeeeeee-0000-4000-8000-00000000000b', 'eeeeeeee-0000-4000-8000-00000000000a',
   now() - interval '1 hour');

select is(
  public.ensure_fixture_markets('eeeeeeee-0000-4000-8000-000000000010'),
  6,
  'a fixture gets one market per active fixture market type');

select public.ensure_fixture_markets('eeeeeeee-0000-4000-8000-000000000011');

select is(
  (select count(*)::int from public.markets m
    where m.fixture_id = 'eeeeeeee-0000-4000-8000-000000000010'
      and m.locks_at = (select kickoff_at from public.fixtures
                         where id = 'eeeeeeee-0000-4000-8000-000000000010')),
  6,
  'every market locks at that fixture own kickoff (D6, per-fixture deadlines)');

select is(
  public.ensure_season_markets('eeeeeeee-0000-4000-8000-000000000002'),
  2,
  'season markets are created for the table predictor and Golden Boot');

select is(
  (select count(*)::int from public.markets m
     join public.market_types mt on mt.id = m.market_type_id
    where mt.scope = 'season'
      and m.locks_at = (select min(kickoff_at) from public.fixtures)),
  2,
  'season markets lock at the season first kickoff (addendum §H.5)');

-- ===========================================================================
-- Composite save
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.save_fixture_prediction(
     'eeeeeeee-0000-4000-8000-000000000010', 2, 1)),
  6,
  'one call saves the whole card across its six markets');

select is(
  (select value from public.predictions p
     join public.markets m on m.id = p.market_id
     join public.market_types mt on mt.id = m.market_type_id
    where mt.code = 'correct_score'
      and m.fixture_id = 'eeeeeeee-0000-4000-8000-000000000010'
      and p.user_id = '11111111-1111-4111-8111-111111111111'),
  '{"away": 1, "home": 2}'::jsonb,
  'the scoreline is stored on the correct_score market');

select is(
  (select value ->> 'value' from public.predictions p
     join public.markets m on m.id = p.market_id
     join public.market_types mt on mt.id = m.market_type_id
    where mt.code = 'goal_diff'
      and m.fixture_id = 'eeeeeeee-0000-4000-8000-000000000010'
      and p.user_id = '11111111-1111-4111-8111-111111111111'),
  null,
  'an unhedged goal difference stores null, meaning "derive it from my scoreline"');

-- Re-saving identical values must not pad the audit trail.
select public.save_fixture_prediction('eeeeeeee-0000-4000-8000-000000000010', 2, 1);

select is(
  (select count(*)::int from public.prediction_revisions
    where user_id = '11111111-1111-4111-8111-111111111111'),
  6,
  'autosaving an unchanged card writes no new revisions');

select public.save_fixture_prediction('eeeeeeee-0000-4000-8000-000000000010', 3, 1);

select is(
  (select count(*)::int from public.prediction_revisions
    where user_id = '11111111-1111-4111-8111-111111111111'),
  7,
  'changing the scoreline appends exactly one revision');

-- ===========================================================================
-- §10.4 item 2 — the composite function is NOT a lock bypass
-- ===========================================================================
select throws_ok(
  $$select public.save_fixture_prediction('eeeeeeee-0000-4000-8000-000000000011', 1, 0)$$,
  '23514',
  null,
  'save_fixture_prediction cannot write after kickoff — it runs SECURITY INVOKER');

-- ===========================================================================
-- Input validation
-- ===========================================================================
select throws_ok(
  $$select public.save_fixture_prediction('eeeeeeee-0000-4000-8000-000000000010', -1, 0)$$,
  '23514',
  null,
  'a negative scoreline is refused');

select throws_ok(
  $$select public.save_fixture_prediction(
      'eeeeeeee-0000-4000-8000-000000000010', 1, 0,
      null, null, null, null, false,
      'eeeeeeee-0000-4000-8000-0000000000f1', true)$$,
  '23514',
  null,
  'a first-scorer answer cannot be both a player and "no scorer"');

-- ===========================================================================
-- Season table predictor
-- ===========================================================================
reset role; reset request.jwt.claims;

-- The season markets created above are already locked, correctly: this season contains a
-- fixture that kicked off an hour ago, and addendum §H.5 locks season markets at the
-- season's first kickoff with no grace window. Push that fixture into the future and
-- re-derive so the save path can be exercised at all.
update public.fixtures set kickoff_at = now() + interval '5 days'
 where id = 'eeeeeeee-0000-4000-8000-000000000011';
update public.seasons set first_kickoff_at = null
 where id = 'eeeeeeee-0000-4000-8000-000000000002';
select public.ensure_season_markets('eeeeeeee-0000-4000-8000-000000000002');

insert into public.teams (id, name, code)
select ('eeeeeeee-0000-4000-8000-' || lpad((100 + g)::text, 12, '0'))::uuid,
       'Team ' || g, 'T' || g
  from generate_series(1, 18) g;

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select throws_ok(
  $$select public.save_season_table_prediction(
      'eeeeeeee-0000-4000-8000-000000000002',
      (select array_agg(id) from (select id from public.teams limit 19) t))$$,
  '23514',
  null,
  'a table ranking fewer than 20 teams is refused');

select lives_ok(
  $$select public.save_season_table_prediction(
      'eeeeeeee-0000-4000-8000-000000000002',
      (select array_agg(id) from (select id from public.teams limit 20) t))$$,
  'a complete 20-team table saves');

select lives_ok(
  $$select public.save_golden_boot_prediction(
      'eeeeeeee-0000-4000-8000-000000000002',
      'eeeeeeee-0000-4000-8000-0000000000f1')$$,
  'a Golden Boot pick saves');

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
