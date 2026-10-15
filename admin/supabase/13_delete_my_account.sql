-- ============================================================================
-- Central POS — 13_delete_my_account.sql
-- Lets a signed-in user permanently DELETE THEIR OWN account, so an account the
-- user deleted can never be silently resurrected by the client's Supabase
-- "heal" fallback (see client/src/services/supabase-account.ts).
--
-- Root cause this fixes: "Delete account" only ever wiped LOCAL IndexedDB data.
-- The Supabase Auth user survived, so the next sign-in attempt failed locally,
-- fell through to healLocalAccountViaSupabase(), re-authenticated against
-- Supabase (credentials still valid), and re-created the local account + trial.
--
-- Run AFTER 01 (profiles) and 08 (auth helpers). Idempotent — safe to re-run.
--
-- Security posture:
--   * SECURITY DEFINER, keyed on auth.uid() — a caller can ONLY delete the
--     account of the token they are already authenticated with. There is
--     deliberately NO email-parameter variant: an anon email-keyed delete would
--     let anyone destroy any account by guessing an address.
--   * The client proves ownership by re-entering the account password
--     (supabase.auth.signInWithPassword) before calling this, so it runs with a
--     genuine, short-lived authenticated session.
--   * Deletion cascades through the FK graph (profiles -> stores, subscriptions,
--     payments, pos_sales; payment_requests.user_id -> set null), so no orphan
--     rows are left behind. NEVER exposes the service-role key.
-- ============================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in to delete your account.';
  end if;

  -- Deleting the auth user cascades to public.profiles (and its dependents).
  delete from auth.users where id = v_uid;
end;
$$;

grant execute on function public.delete_my_account() to authenticated;
