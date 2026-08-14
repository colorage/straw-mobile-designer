-- Community comments on published mobiles, with optional photo attachments.
--
-- Access model:
--   * Everyone (anon + authenticated) can read comments and photos.
--   * Posting requires a signed-in account (same as likes).
--   * Authors can delete their own comments; project owners can delete any
--     comment on their mobile.
--   * Photos live in the public `comment-photos` Storage bucket. Object keys
--     are `{user_id}/{comment_id}/{photo_id}.jpg`. A trigger removes Storage
--     objects when photo rows disappear (comment delete, unpublish, account
--     delete) so project owners can moderate without owning the files.
--   * comments_count is denormalized on public_projects (kept in sync by
--     trigger) so gallery cards can show a count without a join.
--
-- Body-or-photos is enforced by the client: an empty body is allowed at INSERT
-- time because photos are uploaded after the comment row exists.
--
-- Safe to re-run.

alter table public.public_projects
  add column if not exists comments_count integer not null default 0;

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.public_projects (id) on delete cascade,
  author uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists project_comments_project_created_idx
  on public.project_comments (project_id, created_at);
create index if not exists project_comments_author_idx
  on public.project_comments (author);

create table if not exists public.project_comment_photos (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.project_comments (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) between 1 and 512),
  sort_order smallint not null default 0 check (sort_order between 0 and 3)
);

create index if not exists project_comment_photos_comment_idx
  on public.project_comment_photos (comment_id, sort_order);

-- Keep the denormalized comment counter in sync. SECURITY DEFINER because the
-- commenter is not the project owner, so RLS would block their UPDATE otherwise.
create or replace function public.handle_project_comment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.public_projects
      set comments_count = comments_count + 1
      where id = new.project_id;
    return new;
  end if;
  update public.public_projects
    set comments_count = greatest(comments_count - 1, 0)
    where id = old.project_id;
  return old;
end;
$$;

revoke execute on function public.handle_project_comment_change() from public, anon, authenticated;

drop trigger if exists project_comments_count on public.project_comments;
create trigger project_comments_count
  after insert or delete on public.project_comments
  for each row execute function public.handle_project_comment_change();

-- Remove Storage objects when a photo row goes away (direct delete, comment
-- cascade, unpublish, or account deletion). Runs as the function owner so
-- project owners can moderate files they did not upload.
create or replace function public.handle_comment_photo_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from storage.objects
  where bucket_id = 'comment-photos'
    and name = old.storage_path;
  return old;
end;
$$;

revoke execute on function public.handle_comment_photo_storage_cleanup() from public, anon, authenticated;

drop trigger if exists project_comment_photos_storage_cleanup on public.project_comment_photos;
create trigger project_comment_photos_storage_cleanup
  after delete on public.project_comment_photos
  for each row execute function public.handle_comment_photo_storage_cleanup();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comment-photos',
  'comment-photos',
  true,
  5242880,
  array['image/jpeg']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Comment photos are publicly readable" on storage.objects;
create policy "Comment photos are publicly readable"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'comment-photos');

drop policy if exists "Users can upload their own comment photos" on storage.objects;
create policy "Users can upload their own comment photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'comment-photos'
    and name like (select auth.uid())::text || '/%'
  );

drop policy if exists "Users can delete their own comment photos" on storage.objects;
create policy "Users can delete their own comment photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'comment-photos'
    and name like (select auth.uid())::text || '/%'
  );

revoke insert, update on table public.project_comments from anon, authenticated;
grant select on table public.project_comments to anon, authenticated;
grant insert (project_id, body) on table public.project_comments to authenticated;
grant delete on table public.project_comments to authenticated;

revoke insert, update on table public.project_comment_photos from anon, authenticated;
grant select on table public.project_comment_photos to anon, authenticated;
grant insert (comment_id, storage_path, sort_order) on table public.project_comment_photos to authenticated;
grant delete on table public.project_comment_photos to authenticated;

alter table public.project_comments enable row level security;
alter table public.project_comment_photos enable row level security;

drop policy if exists "Comments are readable by everyone" on public.project_comments;
create policy "Comments are readable by everyone"
  on public.project_comments
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can comment as themselves" on public.project_comments;
create policy "Users can comment as themselves"
  on public.project_comments
  for insert
  to authenticated
  with check (author = (select auth.uid()));

drop policy if exists "Authors and project owners can delete comments" on public.project_comments;
create policy "Authors and project owners can delete comments"
  on public.project_comments
  for delete
  to authenticated
  using (
    author = (select auth.uid())
    or exists (
      select 1
      from public.public_projects
      where id = project_id
        and owner = (select auth.uid())
    )
  );

drop policy if exists "Comment photos are readable by everyone" on public.project_comment_photos;
create policy "Comment photos are readable by everyone"
  on public.project_comment_photos
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Authors can attach photos to their comments" on public.project_comment_photos;
create policy "Authors can attach photos to their comments"
  on public.project_comment_photos
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.project_comments
      where id = comment_id
        and author = (select auth.uid())
    )
  );

drop policy if exists "Authors and project owners can delete comment photos" on public.project_comment_photos;
create policy "Authors and project owners can delete comment photos"
  on public.project_comment_photos
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.project_comments c
      where c.id = project_comment_photos.comment_id
        and (
          c.author = (select auth.uid())
          or exists (
            select 1
            from public.public_projects p
            where p.id = c.project_id
              and p.owner = (select auth.uid())
          )
        )
    )
  );
