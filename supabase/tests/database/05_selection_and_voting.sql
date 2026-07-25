-- Task 21: fixture selection and voting (addendum §B).
--
-- The load-bearing rule is invariant 7: a round can never count nothing. Votes are
-- advisory, the organizer decides, and if the organizer goes quiet the fallback saves the
-- matchweek.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test');

insert into public.competitions (id, code, name, kind)
values ('ffffffff-0000-4000-8000-000000000001', 'pl', 'Premier League', 'league');
insert into public.seasons (id, competition_id, label, status, is_current)
values ('ffffffff-0000-4000-8000-000000000002',
        'ffffffff-0000-4000-8000-000000000001', '2026/27', 'active', true);
insert into public.stages (id, season_id, name, kind, sequence)
values ('ffffffff-0000-4000-8000-000000000003',
        'ffffffff-0000-4000-8000-000000000002', 'Regular Season', 'round_robin', 1);
insert into public.rounds (id, stage_id, number, name) values
  ('ffffffff-0000-4000-8000-000000000004', 'ffffffff-0000-4000-8000-000000000003', 1, 'MW1'),
  ('ffffffff-0000-4000-8000-000000000005', 'ffffffff-0000-4000-8000-000000000003', 2, 'MW2');
insert into public.teams (id, name, code) values
  ('ffffffff-0000-4000-8000-00000000000a', 'Alpha FC', 'ALP'),
  ('ffffffff-0000-4000-8000-00000000000b', 'Beta FC', 'BET'),
  ('ffffffff-0000-4000-8000-00000000000c', 'Gamma FC', 'GAM');

-- MW1 is a week out; MW2 kicks off in 12 hours, inside the fallback window.
insert into public.fixtures (id, round_id, home_team_id, away_team_id, kickoff_at) values
  ('ffffffff-0000-4000-8000-000000000010', 'ffffffff-0000-4000-8000-000000000004',
   'ffffffff-0000-4000-8000-00000000000a', 'ffffffff-0000-4000-8000-00000000000b',
   now() + interval '7 days'),
  ('ffffffff-0000-4000-8000-000000000011', 'ffffffff-0000-4000-8000-000000000004',
   'ffffffff-0000-4000-8000-00000000000b', 'ffffffff-0000-4000-8000-00000000000c',
   now() + interval '7 days 2 hours'),
  ('ffffffff-0000-4000-8000-000000000012', 'ffffffff-0000-4000-8000-000000000005',
   'ffffffff-0000-4000-8000-00000000000a', 'ffffffff-0000-4000-8000-00000000000c',
   now() + interval '12 hours');

insert into public.leagues (id, name, join_code, created_by)
values ('ffffffff-0000-4000-8000-000000000040', 'The Boot Room', 'BOOTROOM01',
        '11111111-1111-4111-8111-111111111111');
insert into public.league_members (league_id, user_id, role) values
  ('ffffffff-0000-4000-8000-000000000040', '11111111-1111-4111-8111-111111111111', 'organizer'),
  ('ffffffff-0000-4000-8000-000000000040', '22222222-2222-4222-8222-222222222222', 'member');
insert into public.league_seasons (id, league_id, season_id, selection_mode)
values ('ffffffff-0000-4000-8000-000000000041', 'ffffffff-0000-4000-8000-000000000040',
        'ffffffff-0000-4000-8000-000000000002', 'vote');

-- ===========================================================================
-- Voting
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  public.toggle_fixture_vote('ffffffff-0000-4000-8000-000000000041',
                             'ffffffff-0000-4000-8000-000000000004',
                             'ffffffff-0000-4000-8000-000000000010'),
  true,
  'a member can vote for a fixture');

select is(
  public.toggle_fixture_vote('ffffffff-0000-4000-8000-000000000041',
                             'ffffffff-0000-4000-8000-000000000004',
                             'ffffffff-0000-4000-8000-000000000010'),
  false,
  'toggling again removes the vote');

select public.toggle_fixture_vote('ffffffff-0000-4000-8000-000000000041',
                                  'ffffffff-0000-4000-8000-000000000004',
                                  'ffffffff-0000-4000-8000-000000000010');

reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select public.toggle_fixture_vote('ffffffff-0000-4000-8000-000000000041',
                                  'ffffffff-0000-4000-8000-000000000004',
                                  'ffffffff-0000-4000-8000-000000000010');

select is(
  (select votes from public.round_selection_state(
     'ffffffff-0000-4000-8000-000000000041', 'ffffffff-0000-4000-8000-000000000004')
    where fixture_id = 'ffffffff-0000-4000-8000-000000000010'),
  2,
  'the tally counts every member vote');

select is(
  (select voted_by_me from public.round_selection_state(
     'ffffffff-0000-4000-8000-000000000041', 'ffffffff-0000-4000-8000-000000000004')
    where fixture_id = 'ffffffff-0000-4000-8000-000000000011'),
  false,
  'the caller sees which fixtures they personally voted for');

-- ===========================================================================
-- Finalization — votes are advisory, the organizer decides
-- ===========================================================================
select is(
  public.finalize_round_selection(
    'ffffffff-0000-4000-8000-000000000041',
    'ffffffff-0000-4000-8000-000000000004',
    array['ffffffff-0000-4000-8000-000000000011']::uuid[]),
  1,
  'the organizer may finalize against the tally — votes are advisory (addendum §H.2)');

select is(
  (select count(*)::int from public.league_round_fixtures(
     'ffffffff-0000-4000-8000-000000000041', 'ffffffff-0000-4000-8000-000000000004')),
  1,
  'only the finalized fixture now counts for this league');

select throws_ok(
  $$select public.finalize_round_selection(
      'ffffffff-0000-4000-8000-000000000041',
      'ffffffff-0000-4000-8000-000000000004',
      array[]::uuid[])$$,
  '23514',
  null,
  'a round cannot be finalized empty (invariant 7)');

-- Re-finalizing replaces rather than merges, so unticking actually removes.
select is(
  public.finalize_round_selection(
    'ffffffff-0000-4000-8000-000000000041',
    'ffffffff-0000-4000-8000-000000000004',
    array['ffffffff-0000-4000-8000-000000000010']::uuid[]),
  1,
  'the organizer can change their mind before the first selected kickoff');

select is(
  (select count(*)::int from public.league_round_selections
    where league_season_id = 'ffffffff-0000-4000-8000-000000000041'
      and round_id = 'ffffffff-0000-4000-8000-000000000004'),
  1,
  'finalizing replaces the selection rather than merging into it');

-- ===========================================================================
-- Votes are refused once finalized (the trigger from the baseline migration)
-- ===========================================================================
reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select throws_ok(
  $$select public.toggle_fixture_vote(
      'ffffffff-0000-4000-8000-000000000041',
      'ffffffff-0000-4000-8000-000000000004',
      'ffffffff-0000-4000-8000-000000000011')$$,
  '23514',
  null,
  'voting is rejected at the database once the round is finalized');

select throws_ok(
  $$select public.finalize_round_selection(
      'ffffffff-0000-4000-8000-000000000041',
      'ffffffff-0000-4000-8000-000000000004',
      array['ffffffff-0000-4000-8000-000000000010']::uuid[])$$,
  '42501',
  null,
  'a plain member cannot finalize');

-- ===========================================================================
-- Fallback: an organizer who goes quiet cannot cost their league a matchweek
-- ===========================================================================
reset role; reset request.jwt.claims;

select ok(
  public.apply_selection_fallbacks() >= 1,
  'MW2 is inside the 24h window and unfinalized, so the fallback fires');

select is(
  (select count(*)::int from public.league_round_fixtures(
     'ffffffff-0000-4000-8000-000000000041', 'ffffffff-0000-4000-8000-000000000005')),
  1,
  'every fixture in the fallen-back round counts (addendum §B)');

select is(
  (select source from public.league_round_selections
    where league_season_id = 'ffffffff-0000-4000-8000-000000000041'
      and round_id = 'ffffffff-0000-4000-8000-000000000005'),
  'fallback',
  'and it is recorded as a fallback, not an admin decision');

select * from finish();
rollback;
