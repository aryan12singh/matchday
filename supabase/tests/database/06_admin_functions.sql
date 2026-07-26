-- League administration: rule versioning, prize validation, member roles.
--
-- These are the money-adjacent and history-adjacent controls, so the guards matter more
-- than the happy paths: a rule change must never revalue a played round, and a prize
-- table that does not balance means somebody is owed money nobody owes.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('aaaa1111-1111-4111-8111-111111111111', 'organizer@example.test'),
  ('bbbb2222-2222-4222-8222-222222222222', 'member@example.test');

insert into public.competitions (id, code, name, kind)
values ('cccc0000-0000-4000-8000-000000000001', 'pl', 'Premier League', 'league');
insert into public.seasons (id, competition_id, label, status, is_current)
values ('cccc0000-0000-4000-8000-000000000002',
        'cccc0000-0000-4000-8000-000000000001', '2026/27', 'active', true);
insert into public.stages (id, season_id, name, kind, sequence)
values ('cccc0000-0000-4000-8000-000000000003',
        'cccc0000-0000-4000-8000-000000000002', 'Regular Season', 'round_robin', 1);
-- Matchweek 1 is already played; 2 and 3 are not.
insert into public.rounds (id, stage_id, number, name, status) values
  ('cccc0000-0000-4000-8000-000000000010', 'cccc0000-0000-4000-8000-000000000003', 1, 'MW1', 'completed'),
  ('cccc0000-0000-4000-8000-000000000011', 'cccc0000-0000-4000-8000-000000000003', 2, 'MW2', 'scheduled'),
  ('cccc0000-0000-4000-8000-000000000012', 'cccc0000-0000-4000-8000-000000000003', 3, 'MW3', 'scheduled');

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaa1111-1111-4111-8111-111111111111","role":"authenticated"}';

create temporary table lg as select * from public.create_league('Test League');
select public.enrol_league_season(
  (select league_id from lg), 'cccc0000-0000-4000-8000-000000000002') as ls_id \gset

reset role; reset request.jwt.claims;
insert into public.league_members (league_id, user_id, role)
values ((select league_id from lg), 'bbbb2222-2222-4222-8222-222222222222', 'member');

-- ===========================================================================
-- Rule-set versioning
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaa1111-1111-4111-8111-111111111111","role":"authenticated"}';

select isnt(
  public.create_rule_set_version(
    :'ls_id'::uuid,
    '{"categories":{"outcome":{"enabled":true,"weight":5}},"tiebreaks":["points"]}'::jsonb,
    2),
  null,
  'an organizer can create a new rule-set version from an unplayed round');

select is(
  (select count(*)::int from public.rule_set_versions),
  2,
  'the new version is added rather than replacing v1 — versions are immutable');

select is(
  (select rsv.version from public.league_rule_bindings b
     join public.rule_set_versions rsv on rsv.id = b.rule_set_version_id
    where b.league_season_id = :'ls_id'::uuid and b.effective_from_round = 2),
  2,
  'and it is bound from matchweek 2');

select is(
  ((select public.league_weights(:'ls_id'::uuid, 1)) -> 'categories' -> 'outcome' ->> 'weight')::int,
  3,
  'matchweek 1 still resolves to the ORIGINAL weights — history is not revalued');

select is(
  ((select public.league_weights(:'ls_id'::uuid, 2)) -> 'categories' -> 'outcome' ->> 'weight')::int,
  5,
  'matchweek 2 resolves to the new weights');

select throws_ok(
  format($$select public.create_rule_set_version(%L,
    '{"categories":{},"tiebreaks":["points"]}'::jsonb, 1)$$, :'ls_id'),
  '23514',
  null,
  'a rule change cannot be backdated into a round that has already been played');

-- ===========================================================================
-- Prize schemes
-- ===========================================================================
select throws_ok(
  format($$select public.upsert_prize_scheme(%L, 'zero_sum_rank_table', '£',
    '{"overall":[10,5]}'::jsonb)$$, :'ls_id'),
  '23514',
  null,
  'a prize table that does not add up to zero is refused');

select throws_ok(
  format($$select public.upsert_prize_scheme(%L, 'zero_sum_rank_table', '£',
    '{"overall":[10,0,-5,-5]}'::jsonb)$$, :'ls_id'),
  '23514',
  null,
  'a prize table with the wrong number of positions is refused');

select isnt(
  public.upsert_prize_scheme(:'ls_id'::uuid, 'zero_sum_rank_table', '£',
    '{"overall":[10,-10],"per_round":[5,-5]}'::jsonb),
  null,
  'a balanced table sized to the league is accepted');

select isnt(
  (select prize_scheme_id from public.league_seasons where id = :'ls_id'::uuid),
  null,
  'and the league_season points at it — this is what switches money UI on');

select lives_ok(
  format('select public.clear_prize_scheme(%L)', :'ls_id'),
  'prizes can be turned off again');

select is(
  (select prize_scheme_id from public.league_seasons where id = :'ls_id'::uuid),
  null,
  'clearing returns the league to points-only');

-- ===========================================================================
-- Member roles
-- ===========================================================================
select throws_ok(
  format($$select public.set_member_role(%L, 'aaaa1111-1111-4111-8111-111111111111', 'member')$$,
    (select league_id from lg)),
  '23514',
  null,
  'the last organizer cannot demote themselves');

select lives_ok(
  format($$select public.set_member_role(%L, 'bbbb2222-2222-4222-8222-222222222222', 'organizer')$$,
    (select league_id from lg)),
  'a member can be promoted');

select throws_ok(
  format($$select public.remove_member(%L, 'aaaa1111-1111-4111-8111-111111111111')$$,
    (select league_id from lg)),
  '23514',
  null,
  'an organizer cannot remove themselves — leave_league is the path for that');

-- ===========================================================================
-- A plain member cannot administer anything
-- ===========================================================================
reset role; reset request.jwt.claims;
update public.league_members set role = 'member'
 where league_id = (select league_id from lg)
   and user_id = 'bbbb2222-2222-4222-8222-222222222222';

set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbb2222-2222-4222-8222-222222222222","role":"authenticated"}';

select throws_ok(
  format($$select public.create_rule_set_version(%L,
    '{"categories":{},"tiebreaks":["points"]}'::jsonb, 3)$$, :'ls_id'),
  '42501',
  null,
  'a member cannot change scoring rules');

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
