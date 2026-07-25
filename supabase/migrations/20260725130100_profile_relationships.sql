-- Repoint user-scoped foreign keys from auth.users to public.profiles.
--
-- Why: every league screen needs to render a username next to a row — members,
-- leaderboards, vote tallies, the activity feed. With the FK pointing at auth.users,
-- PostgREST cannot embed `profiles`, because there is no relationship between the two
-- public tables; each of those screens would need a second round trip and a manual join.
--
-- This is safe and loses nothing: profiles.id itself references auth.users(id) on delete
-- cascade, so deleting an auth user still cascades through profiles to these rows exactly
-- as before. It also makes the invariant explicit — these columns mean "a MatchDay
-- player", and a player is a profile.
--
-- Additive and forward-only in the sense that matters: it rewrites constraints, not data,
-- and no earlier migration file is edited.

-- ---------------------------------------------------------------------------
-- ON DELETE CASCADE columns
-- ---------------------------------------------------------------------------
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('league_members',     'user_id'),
      ('predictions',        'user_id'),
      ('score_components',   'user_id'),
      ('rank_snapshots',     'user_id'),
      ('prize_settlements',  'user_id'),
      ('rivals',             'user_id'),
      ('rivals',             'rival_user_id'),
      ('push_subscriptions', 'user_id'),
      ('notification_prefs', 'user_id'),
      ('notification_log',   'user_id'),
      ('admin_audit_log',    'actor_user_id')
    ) as t(table_name, column_name)
  loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      spec.table_name, spec.table_name || '_' || spec.column_name || '_fkey');

    execute format(
      'alter table public.%I add constraint %I foreign key (%I)
         references public.profiles(id) on delete cascade',
      spec.table_name,
      spec.table_name || '_' || spec.column_name || '_fkey',
      spec.column_name);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- ON DELETE SET NULL columns — an audit row outlives the account that caused it.
-- ---------------------------------------------------------------------------
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('league_events', 'actor_user_id'),
      ('score_runs',    'initiated_by'),
      ('leagues',       'created_by')
    ) as t(table_name, column_name)
  loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      spec.table_name, spec.table_name || '_' || spec.column_name || '_fkey');

    execute format(
      'alter table public.%I add constraint %I foreign key (%I)
         references public.profiles(id) on delete set null',
      spec.table_name,
      spec.table_name || '_' || spec.column_name || '_fkey',
      spec.column_name);
  end loop;
end;
$$;

-- prize_settlements.revised_from and league_rule_bindings.bound_by stay as they are:
-- the first is a self-reference, and the second is already nullable audit metadata that
-- no screen embeds.
alter table public.league_rule_bindings drop constraint if exists league_rule_bindings_bound_by_fkey;
alter table public.league_rule_bindings
  add constraint league_rule_bindings_bound_by_fkey
  foreign key (bound_by) references public.profiles(id) on delete set null;
