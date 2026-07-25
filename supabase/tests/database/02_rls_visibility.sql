-- The §10.4 "definition of done" security checklist, as executable tests.
--
--   1. Member A cannot read member B's prediction on an open market
--   3. Non-member cannot read a league, its members or its events
--   4. Member cannot read join_code; organizer can
--   5. Anon/authenticated cannot read raw_payloads / sync_runs
--   6. Reveal policies behave: at_kickoff hides until locked; after_own_submission
--      additionally requires the viewer to have predicted
--
-- (Item 2, the post-lock write, lives in 01_locks_and_immutability.sql. Items 7 and 8 are
-- repo-check and route tests, not database tests.)
--
-- Cast: alice and bob share The Boot Room (reveal at_kickoff). alice and dave share
-- Sunday League (reveal after_own_submission). carol shares nothing with anyone.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'carol@example.test'),
  ('44444444-4444-4444-8444-444444444444', 'dave@example.test');

insert into public.competitions (id, code, name, kind)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'test-league', 'Test League', 'league');

insert into public.seasons (id, competition_id, label, status, is_current)
values ('bbbbbbbb-0000-4000-8000-000000000002',
        'bbbbbbbb-0000-4000-8000-000000000001', '2026/27', 'active', true);

insert into public.stages (id, season_id, name, kind, sequence)
values ('bbbbbbbb-0000-4000-8000-000000000003',
        'bbbbbbbb-0000-4000-8000-000000000002', 'Regular Season', 'round_robin', 1);

insert into public.rounds (id, stage_id, number, name)
values ('bbbbbbbb-0000-4000-8000-000000000004',
        'bbbbbbbb-0000-4000-8000-000000000003', 1, 'Matchweek 1');

insert into public.teams (id, name, code) values
  ('bbbbbbbb-0000-4000-8000-00000000000a', 'Home FC', 'HOM'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'Away FC', 'AWY');

insert into public.fixtures (id, round_id, home_team_id, away_team_id, kickoff_at)
values
  ('bbbbbbbb-0000-4000-8000-000000000010', 'bbbbbbbb-0000-4000-8000-000000000004',
   'bbbbbbbb-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b',
   now() + interval '2 days'),
  ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000004',
   'bbbbbbbb-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-00000000000a',
   now() + interval '3 days');

-- An open market and a locked one.
insert into public.markets (id, market_type_id, season_id, fixture_id, locks_at, status)
select 'bbbbbbbb-0000-4000-8000-000000000020', mt.id,
       'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000010',
       now() + interval '2 days', 'open'
  from public.market_types mt where mt.code = 'correct_score';

insert into public.markets (id, market_type_id, season_id, fixture_id, locks_at, status)
select 'bbbbbbbb-0000-4000-8000-000000000021', mt.id,
       'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000011',
       now() + interval '3 days', 'locked'
  from public.market_types mt where mt.code = 'correct_score';

-- Alice predicts both. Written as the service role so the locked one is allowed.
insert into public.predictions (user_id, market_id, value) values
  ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-0000-4000-8000-000000000020',
   '{"home":2,"away":1}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-0000-4000-8000-000000000021',
   '{"home":0,"away":3}'::jsonb);

insert into public.leagues (id, name, join_code, created_by) values
  ('bbbbbbbb-0000-4000-8000-000000000040', 'The Boot Room', 'BOOTROOM01',
   '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-0000-4000-8000-000000000050', 'Sunday League', 'SUNDAYLGE1',
   '11111111-1111-4111-8111-111111111111');

insert into public.league_members (league_id, user_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000040', '11111111-1111-4111-8111-111111111111', 'organizer'),
  ('bbbbbbbb-0000-4000-8000-000000000040', '22222222-2222-4222-8222-222222222222', 'member'),
  ('bbbbbbbb-0000-4000-8000-000000000050', '11111111-1111-4111-8111-111111111111', 'organizer'),
  ('bbbbbbbb-0000-4000-8000-000000000050', '44444444-4444-4444-8444-444444444444', 'member');

insert into public.league_seasons (id, league_id, season_id, reveal_policy) values
  ('bbbbbbbb-0000-4000-8000-000000000041', 'bbbbbbbb-0000-4000-8000-000000000040',
   'bbbbbbbb-0000-4000-8000-000000000002', 'at_kickoff'),
  ('bbbbbbbb-0000-4000-8000-000000000051', 'bbbbbbbb-0000-4000-8000-000000000050',
   'bbbbbbbb-0000-4000-8000-000000000002', 'after_own_submission');

insert into public.league_events (league_id, type, payload)
values ('bbbbbbbb-0000-4000-8000-000000000040', 'member_joined', '{}'::jsonb);

insert into public.sync_runs (kind, trigger_source, status)
values ('sync_fixtures', 'tick', 'success');

insert into public.raw_payloads (provider, endpoint, params_hash, payload)
values ('api-football', '/fixtures', 'deadbeef', '{"response":[]}'::jsonb);

-- ===========================================================================
-- §10.4 item 1 + 6 — prediction visibility
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.predictions
    where user_id = '11111111-1111-4111-8111-111111111111'),
  2,
  'a user always sees their own predictions');

reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.predictions
    where market_id = 'bbbbbbbb-0000-4000-8000-000000000020'),
  0,
  'a league mate cannot read a prediction on an OPEN market (§10.4 item 1)');

select is(
  (select count(*)::int from public.predictions
    where market_id = 'bbbbbbbb-0000-4000-8000-000000000021'),
  1,
  'a league mate CAN read it once the market is locked (reveal at_kickoff)');

-- dave shares only the after_own_submission league and has not predicted yet.
reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';

select is(
  (select count(*)::int from public.predictions
    where market_id = 'bbbbbbbb-0000-4000-8000-000000000021'),
  0,
  'after_own_submission hides a locked prediction from someone who has not predicted (§10.4 item 6)');

reset role; reset request.jwt.claims;
-- dave predicts the locked market (service-role write, as settlement would).
insert into public.predictions (user_id, market_id, value)
values ('44444444-4444-4444-8444-444444444444',
        'bbbbbbbb-0000-4000-8000-000000000021', '{"home":1,"away":1}'::jsonb);

set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';

select is(
  (select count(*)::int from public.predictions
    where market_id = 'bbbbbbbb-0000-4000-8000-000000000021'
      and user_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'after_own_submission reveals once the viewer has submitted their own');

-- carol shares nothing.
reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.predictions),
  0,
  'a user with no shared league sees no predictions at all');

-- ===========================================================================
-- §10.4 item 3 — non-member cannot read a league, its members or its events
-- ===========================================================================
select is(
  (select count(*)::int from public.leagues),
  0,
  'a non-member cannot read any league (§10.4 item 3)');

select is(
  (select count(*)::int from public.league_members),
  0,
  'a non-member cannot read league membership');

select is(
  (select count(*)::int from public.league_events),
  0,
  'a non-member cannot read league events');

select is(
  (select count(*)::int from public.league_seasons),
  0,
  'a non-member cannot read league season settings');

-- ===========================================================================
-- §10.4 item 5 — sync and provider internals are unreachable from any client role
-- ===========================================================================
select throws_ok(
  'select * from public.raw_payloads',
  '42501',
  null,
  'authenticated cannot read raw_payloads (§10.4 item 5)');

select throws_ok(
  'select * from public.sync_runs',
  '42501',
  null,
  'authenticated cannot read sync_runs');

select throws_ok(
  'select * from public.provider_entity_map',
  '42501',
  null,
  'authenticated cannot read provider ids — app code addresses entities by uuid only');

-- ===========================================================================
-- §10.4 item 4 — join_code
-- ===========================================================================
reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select throws_ok(
  'select join_code from public.leagues',
  '42501',
  null,
  'a member cannot read join_code at all (column privilege, §10.4 item 4)');

select is(
  public.league_join_code('bbbbbbbb-0000-4000-8000-000000000040'),
  null,
  'league_join_code returns null to a plain member');

reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is(
  public.league_join_code('bbbbbbbb-0000-4000-8000-000000000040'),
  'BOOTROOM01',
  'league_join_code returns the code to an organizer');

-- ===========================================================================
-- Addendum §H.2 — vote tallies are visible, voters are not
-- ===========================================================================
reset role; reset request.jwt.claims;
update public.league_seasons set selection_mode = 'vote'
 where id = 'bbbbbbbb-0000-4000-8000-000000000041';

insert into public.league_fixture_votes (league_season_id, round_id, fixture_id, user_id)
values
  ('bbbbbbbb-0000-4000-8000-000000000041', 'bbbbbbbb-0000-4000-8000-000000000004',
   'bbbbbbbb-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-0000-4000-8000-000000000041', 'bbbbbbbb-0000-4000-8000-000000000004',
   'bbbbbbbb-0000-4000-8000-000000000010', '22222222-2222-4222-8222-222222222222');

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  (select votes from public.league_vote_tallies
    where fixture_id = 'bbbbbbbb-0000-4000-8000-000000000010'),
  2,
  'a member sees the vote tally for their league');

select is(
  (select count(*)::int from public.league_fixture_votes),
  1,
  'but sees only their OWN vote row — voter identity is never exposed (§H.2)');

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
