-- Account deletion.
--
-- The privacy notice promises this and there was no way to do it. It has to be a database
-- function rather than a route: touching auth.users needs privileges the browser will
-- never have, and doing it from application code would mean trusting a client-supplied
-- user id.
--
-- The hard part is what must NOT be destroyed. score_components are the inputs to other
-- members' completed matchweeks, and the cascade chain runs
--
--     auth.users → profiles → score_components
--
-- so simply deleting the auth row takes every settled score with it. That would silently
-- change leaderboards other people have already seen, and in a league playing for money,
-- already settled up on. Ranks would shift under them with no explanation.
--
-- So this erases the person and keeps the arithmetic: every piece of personal data is
-- destroyed or overwritten, and what remains is an opaque uuid with a placeholder name
-- that cannot sign in, cannot be contacted, and identifies nobody. That is anonymisation
-- rather than erasure, which is the appropriate answer when data has to be retained for a
-- legitimate reason — and it is exactly what /legal/privacy tells users will happen.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp, auth
as $$
declare
  v_user uuid := auth.uid();
  v_sole_organizer int;
  v_tombstone text;
begin
  if v_user is null then
    raise exception 'must be signed in' using errcode = 'insufficient_privilege';
  end if;

  -- A league whose only organizer leaves becomes unadministrable: nobody can bind rules,
  -- pick fixtures or remove members ever again. leave_league already refuses this, and so
  -- does this, for the same reason.
  select count(*) into v_sole_organizer
    from public.league_members me
   where me.user_id = v_user
     and me.role = 'organizer'
     and not exists (
       select 1 from public.league_members other
        where other.league_id = me.league_id
          and other.role = 'organizer'
          and other.user_id <> v_user
     );

  if v_sole_organizer > 0 then
    raise exception 'promote another organizer in % league(s) before deleting your account',
      v_sole_organizer using errcode = 'check_violation';
  end if;

  v_tombstone := 'deleted-' || left(replace(v_user::text, '-', ''), 8);

  -- Everything personal and genuinely removable.
  delete from public.push_subscriptions where user_id = v_user;
  delete from public.notification_prefs where user_id = v_user;
  delete from public.notification_log where user_id = v_user;
  delete from public.rivals where user_id = v_user or rival_user_id = v_user;
  delete from public.league_members where user_id = v_user;
  delete from public.league_fixture_votes where user_id = v_user;

  -- The profile becomes a tombstone rather than disappearing, because score_components
  -- cascade from it.
  update public.profiles
     set username = v_tombstone,
         avatar_url = null,
         active_league_id = null,
         timezone = null,
         -- Rotated rather than cleared: the column is NOT NULL, and rotating also kills
         -- the old calendar feed URL, which would otherwise keep serving fixtures to
         -- whatever the person had subscribed it to.
         calendar_token = gen_random_uuid()
   where id = v_user;

  -- Predictions are deliberately kept. prediction_revisions is append-only and immutable
  -- by trigger — it is the evidence that nobody edited an answer after kick-off — and the
  -- rows are anonymous once the profile above is scrubbed.

  -- The identity itself: the email is the personal data, so it is destroyed. The row
  -- survives only as the anchor the cascade chain hangs from.
  update auth.users
     set email = v_tombstone || '@deleted.invalid',
         phone = null,
         encrypted_password = null,
         email_confirmed_at = null,
         phone_confirmed_at = null,
         confirmation_token = '',
         recovery_token = '',
         email_change = '',
         email_change_token_new = '',
         email_change_token_current = '',
         raw_user_meta_data = '{}'::jsonb,
         raw_app_meta_data = '{}'::jsonb,
         -- Belt and braces: even if a credential survived somewhere, sign-in is refused.
         banned_until = 'infinity'::timestamptz,
         updated_at = now()
   where id = v_user;

  -- Any live session or federated identity goes, so "deleted" takes effect immediately
  -- rather than whenever the current token expires.
  delete from auth.sessions where user_id = v_user;
  delete from auth.refresh_tokens where user_id = v_user::text;
  delete from auth.identities where user_id = v_user;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
-- service_role is the backend and runs everything; a function it cannot execute breaks the
-- invariant asserted in tests/database/07_grants.sql.
grant execute on all routines in schema public to service_role;

comment on function public.delete_own_account() is
  'Erases the caller''s personal data and disables sign-in. The profile row survives as an anonymous tombstone because settled score_components cascade from it, and removing them would change other members'' completed matchweeks.';
