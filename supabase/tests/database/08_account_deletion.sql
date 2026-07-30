-- Account deletion.
--
-- The dangerous half of this feature is not what it removes, it is what it must NOT
-- remove. Cascading from auth.users would take score_components with it, silently
-- changing a leaderboard other members have already seen and settled up on.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('dddd1111-1111-4111-8111-111111111111', 'leaver@example.test'),
  ('dddd2222-2222-4222-8222-222222222222', 'stayer@example.test');

insert into public.competitions (id, code, name, kind)
values ('eeee0000-0000-4000-8000-000000000001', 'pl', 'Premier League', 'league');
insert into public.seasons (id, competition_id, label, status, is_current)
values ('eeee0000-0000-4000-8000-000000000002',
        'eeee0000-0000-4000-8000-000000000001', '2026/27', 'active', true);

-- Two members, both organizers, so neither is the last one standing.
set local role authenticated;
set local request.jwt.claims to '{"sub":"dddd1111-1111-4111-8111-111111111111","role":"authenticated"}';
create temporary table lg as select * from public.create_league('Leavers United');
reset role; reset request.jwt.claims;

insert into public.league_members (league_id, user_id, role)
values ((select league_id from lg), 'dddd2222-2222-4222-8222-222222222222', 'organizer');

-- A settled score belonging to the leaver, standing in for a completed matchweek.
insert into public.market_types (id, code, scope, answer_schema, settler, display, active)
values ('eeee0000-0000-4000-8000-000000000010', 'test_market', 'fixture', '{}', 'x', '{}', true)
on conflict (code) do nothing;

insert into public.markets (id, market_type_id, season_id, opens_at, locks_at, status)
values ('eeee0000-0000-4000-8000-000000000020',
        (select id from public.market_types where code = 'test_market'),
        'eeee0000-0000-4000-8000-000000000002', now(), now(), 'settled');

-- A component belongs to a score run and records the rule-set version it was computed
-- under (invariant 4), so both are real rather than invented.
insert into public.score_runs (id, trigger, scope, status)
values ('eeee0000-0000-4000-8000-000000000030', 'auto_result', '{}', 'success');

insert into public.score_components
  (user_id, market_id, category, hit, raw, rule_set_version_id, score_run_id)
values ('dddd1111-1111-4111-8111-111111111111',
        'eeee0000-0000-4000-8000-000000000020', 'outcome', true, '{}',
        (select id from public.rule_set_versions order by version limit 1),
        'eeee0000-0000-4000-8000-000000000030');

insert into public.notification_prefs (user_id, type, channel, enabled)
values ('dddd1111-1111-4111-8111-111111111111', 'deadline_reminder', 'push', true);

insert into public.push_subscriptions (user_id, endpoint, keys)
values ('dddd1111-1111-4111-8111-111111111111', 'https://push.example/abc', '{"p256dh":"x","auth":"y"}');

-- ===========================================================================
-- Refusals
-- ===========================================================================
reset role; reset request.jwt.claims;
select throws_ok(
  'select public.delete_own_account()',
  '42501',
  null,
  'a signed-out caller cannot delete an account');

-- The stayer is now the only other organizer; demote them so the leaver is the last one.
update public.league_members set role = 'member'
 where league_id = (select league_id from lg)
   and user_id = 'dddd2222-2222-4222-8222-222222222222';

set local role authenticated;
set local request.jwt.claims to '{"sub":"dddd1111-1111-4111-8111-111111111111","role":"authenticated"}';

select throws_ok(
  'select public.delete_own_account()',
  '23514',
  null,
  'the last organizer of a league cannot delete themselves — the league would be unadministrable');

-- auth.users is not readable as `authenticated`, so the check runs unprivileged.
reset role; reset request.jwt.claims;
select is(
  (select count(*)::int from auth.users where id = 'dddd1111-1111-4111-8111-111111111111'),
  1,
  'and the refusal left the account intact');

-- ===========================================================================
-- The happy path
-- ===========================================================================
update public.league_members set role = 'organizer'
 where league_id = (select league_id from lg)
   and user_id = 'dddd2222-2222-4222-8222-222222222222';

set local role authenticated;
set local request.jwt.claims to '{"sub":"dddd1111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok(
  'select public.delete_own_account()',
  'with another organizer in place, the account deletes');

reset role; reset request.jwt.claims;

-- The row survives as an anchor, but nothing personal does and sign-in is refused.
select is(
  (select email::text from auth.users where id = 'dddd1111-1111-4111-8111-111111111111'),
  'deleted-dddd1111@deleted.invalid',
  'the email address is destroyed');

select ok(
  (select encrypted_password is null and banned_until = 'infinity'::timestamptz
     from auth.users where id = 'dddd1111-1111-4111-8111-111111111111'),
  'the account cannot sign in again');

select ok(
  (select username = 'deleted-dddd1111' and avatar_url is null
     from public.profiles where id = 'dddd1111-1111-4111-8111-111111111111'),
  'the profile is an anonymous tombstone — no name, no avatar');

select is(
  (select count(*)::int from public.push_subscriptions
    where user_id = 'dddd1111-1111-4111-8111-111111111111'),
  0,
  'push subscriptions are removed — no notifications to a deleted account');

select is(
  (select count(*)::int from public.notification_prefs
    where user_id = 'dddd1111-1111-4111-8111-111111111111'),
  0,
  'notification preferences are removed');

select is(
  (select count(*)::int from public.league_members
    where user_id = 'dddd1111-1111-4111-8111-111111111111'),
  0,
  'league memberships are removed');

-- The one that matters.
select is(
  (select count(*)::int from public.score_components
    where user_id = 'dddd1111-1111-4111-8111-111111111111'),
  1,
  'settled scores SURVIVE — deleting them would change a leaderboard other members already saw');

select * from finish();
rollback;
