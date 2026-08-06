-- Straw Mobile Designer: accounts and cloud-saved projects.
--
-- Accounts are username + password (with an optional linked Google identity).
-- No email is ever collected or sent: password signups use a synthetic address
-- derived from the username, and "Confirm email" must be disabled in the
-- dashboard for signup to return a session. See supabase/README.md.
--
-- Safe to re-run.

create schema if not exists app_private;
revoke all on schema app_private from anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Login handle. Null only for Google-first users until they claim one.
  username text unique,
  -- Display name, freely editable.
  nickname text not null default 'Builder',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.profiles
    add constraint profiles_username_format
    check (username is null or username ~ '^[a-z0-9_]{3,20}$');
exception
  when duplicate_object then null;
end;
$$;

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

-- Lets the app self-heal a missing profile row (users created before this
-- schema existed); the id check keeps it to the caller's own row.
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Untitled',
  -- Gallery card preview, stored as a data URL to mirror the local gallery.
  thumbnail_data_url text,
  -- ProjectSnapshot: shapes, connections, strawSize, slots.
  project jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_id_updated_at_idx
  on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own on public.projects
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function app_private.touch_updated_at();

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function app_private.touch_updated_at();

-- A username is a permanent handle: it may be claimed once, never changed or
-- cleared. Nickname is the editable display name instead.
create or replace function app_private.freeze_username()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.username is not null and new.username is distinct from old.username then
    raise exception 'username cannot be changed once set'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_freeze_username on public.profiles;
create trigger profiles_freeze_username
  before update on public.profiles
  for each row execute function app_private.freeze_username();

-- Create the profile alongside the auth user. A requested username that is
-- malformed or already taken is dropped rather than failing the signup, which
-- leaves the user in the "claim a username" flow instead of half-registered.
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := lower(nullif(new.raw_user_meta_data ->> 'username', ''));
  display text := coalesce(
    nullif(new.raw_user_meta_data ->> 'nickname', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    requested,
    'Builder'
  );
begin
  if requested is not null and (
    requested !~ '^[a-z0-9_]{3,20}$'
    or exists (select 1 from public.profiles p where p.username = requested)
  ) then
    requested := null;
  end if;

  insert into public.profiles (id, username, nickname)
  values (new.id, requested, display)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function app_private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();
