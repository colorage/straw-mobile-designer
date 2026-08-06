-- Community gallery: publicly shared straw-mobile projects with per-user likes.
--
-- Access model:
--   * Everyone (anon + authenticated) can read public projects and likes.
--   * Publishing requires a signed-in user (the app uses anonymous sign-in),
--     and only the publisher can update or unpublish their rows.
--   * One like per user per project, enforced by the composite primary key.
--   * likes_count is denormalized on public_projects (kept in sync by trigger)
--     so the gallery can cheaply sort by most-liked.

create table public.public_projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  thumbnail_data_url text not null default '' check (char_length(thumbnail_data_url) <= 500000),
  project jsonb not null check (pg_column_size(project) <= 1000000),
  likes_count integer not null default 0,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index public_projects_published_at_idx
  on public.public_projects (published_at desc);
create index public_projects_likes_count_idx
  on public.public_projects (likes_count desc, published_at desc);
create index public_projects_owner_idx
  on public.public_projects (owner);

create table public.project_likes (
  project_id uuid not null references public.public_projects (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index project_likes_user_id_idx on public.project_likes (user_id);

-- Keep the denormalized like counter in sync. SECURITY DEFINER because the
-- liker is not the project owner, so RLS would block their UPDATE otherwise.
-- Not callable through the Data API (returns trigger) and EXECUTE is revoked.
create or replace function public.handle_project_like_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.public_projects
      set likes_count = likes_count + 1
      where id = new.project_id;
    return new;
  end if;
  update public.public_projects
    set likes_count = greatest(likes_count - 1, 0)
    where id = old.project_id;
  return old;
end;
$$;

revoke execute on function public.handle_project_like_change() from public, anon, authenticated;

create trigger project_likes_count
  after insert or delete on public.project_likes
  for each row execute function public.handle_project_like_change();

create or replace function public.handle_public_project_updated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.handle_public_project_updated() from public, anon, authenticated;

create trigger public_projects_updated_at
  before update on public.public_projects
  for each row execute function public.handle_public_project_updated();

-- Column-level grants: clients can never write owner, likes_count, or the
-- timestamp columns directly (defaults and triggers own those).
revoke insert, update on table public.public_projects from anon, authenticated;
grant insert (name, thumbnail_data_url, project) on table public.public_projects to authenticated;
grant update (name, thumbnail_data_url, project) on table public.public_projects to authenticated;

revoke insert, update on table public.project_likes from anon, authenticated;
grant insert (project_id) on table public.project_likes to authenticated;

alter table public.public_projects enable row level security;
alter table public.project_likes enable row level security;

create policy "Public projects are readable by everyone"
  on public.public_projects
  for select
  to anon, authenticated
  using (true);

create policy "Users can publish their own projects"
  on public.public_projects
  for insert
  to authenticated
  with check (owner = (select auth.uid()));

create policy "Publishers can update their own projects"
  on public.public_projects
  for update
  to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

create policy "Publishers can unpublish their own projects"
  on public.public_projects
  for delete
  to authenticated
  using (owner = (select auth.uid()));

create policy "Likes are readable by everyone"
  on public.project_likes
  for select
  to anon, authenticated
  using (true);

create policy "Users can like projects as themselves"
  on public.project_likes
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can remove their own likes"
  on public.project_likes
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
