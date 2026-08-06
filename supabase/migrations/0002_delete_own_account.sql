-- Let a signed-in user permanently delete their own auth account.
-- profiles and projects cascade via ON DELETE CASCADE from auth.users.
-- Safe to re-run.

create schema if not exists app_private;
revoke all on schema app_private from anon, authenticated;

-- Deletes only the caller's auth.users row. Runs as the function owner so the
-- authenticated role never needs direct write access to auth.users.
create or replace function app_private.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function app_private.delete_own_account() from public, anon, authenticated;

-- Thin RPC wrapper so the client can call supabase.rpc('delete_own_account').
create or replace function public.delete_own_account()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform app_private.delete_own_account();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
