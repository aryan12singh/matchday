-- Task 15 acceptance: two-user join flow, and §10.4 items 3 and 4 exercised through the
-- functions the app actually calls rather than through direct table writes.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'carol@example.test');

insert into public.competitions (id, code, name, kind)
values ('dddddddd-0000-4000-8000-000000000001', 'pl', 'Premier League', 'league');

insert into public.seasons (id, competition_id, label, status, is_current)
values ('dddddddd-0000-4000-8000-000000000002',
        'dddddddd-0000-4000-8000-000000000001', '2026/27', 'active', true);

-- ===========================================================================
-- alice creates a league
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

create temporary table created as
  select * from public.create_league('The Boot Room');

select is(
  (select count(*)::int from created),
  1,
  'create_league returns the new league');

select ok(
  (select char_length(join_code) >= 10 from created),
  'the generated join code is at least 10 characters (§10.3)');

select ok(
  (select join_code !~ '[ILOU]' from created),
  'the code alphabet omits I, L, O and U — these get typed by hand from a group chat');

select is(
  (select role from public.league_members
    where league_id = (select league_id from created)
      and user_id = '11111111-1111-4111-8111-111111111111'),
  'organizer',
  'the creator is enrolled as organizer atomically with the league');

-- ===========================================================================
-- Enrolment binds a rule set. A league_season with no binding scores everyone zero,
-- which is indistinguishable from a scoring bug.
-- ===========================================================================
select public.enrol_league_season(
  (select league_id from created),
  'dddddddd-0000-4000-8000-000000000002') as league_season_id \gset

select is(
  (select count(*)::int from public.league_rule_bindings
    where league_season_id = :'league_season_id'::uuid),
  1,
  'enrolment binds rule set v1 from round 1');

select is(
  (select selection_mode from public.league_seasons where id = :'league_season_id'::uuid),
  'all',
  'a new league counts every fixture until told otherwise');

select is(
  (select fixtures_per_round from public.league_seasons where id = :'league_season_id'::uuid),
  null,
  'there is no default fixtures-per-round target (addendum §H.1)');

-- ===========================================================================
-- bob joins with the code
-- ===========================================================================
reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  public.join_league((select join_code from created)),
  (select league_id from created),
  'a second user joins with the code');

select is(
  (select role from public.league_members
    where league_id = (select league_id from created)
      and user_id = '22222222-2222-4222-8222-222222222222'),
  'member',
  'they join as a member, not an organizer');

-- Joining twice is a no-op, not an error: people double-tap invite links.
select lives_ok(
  format('select public.join_league(%L)', (select join_code from created)),
  'joining again is idempotent');

select is(
  (select count(*)::int from public.league_members
    where league_id = (select league_id from created)),
  2,
  'and does not duplicate the membership');

select throws_ok(
  $$select public.join_league('NOTAREALCODE')$$,
  'P0002',
  null,
  'an unknown code is refused');

-- ===========================================================================
-- Organizer-only operations
-- ===========================================================================
select throws_ok(
  format('select public.regenerate_join_code(%L)', (select league_id from created)),
  '42501',
  null,
  'a plain member cannot regenerate the join code');

-- ===========================================================================
-- The last organizer cannot abandon the league
-- ===========================================================================
reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select throws_ok(
  format('select public.leave_league(%L)', (select league_id from created)),
  '23514',
  null,
  'the only organizer must promote someone before leaving — otherwise the league is unadministrable');

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
