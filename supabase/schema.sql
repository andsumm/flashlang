-- Run once in your Supabase project's SQL Editor. Safe to run again.
-- One atomic JSON document per account keeps the free static app simple.
begin;

create table if not exists public.libraries (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"version":1,"classes":[],"activity":[],"settings":{"dailyGoal":20}}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint library_is_object check (jsonb_typeof(data) = 'object'),
  constraint library_has_classes check (data ? 'classes' and jsonb_typeof(data -> 'classes') = 'array')
);

alter table public.libraries enable row level security;
alter table public.libraries force row level security;

revoke all on table public.libraries from anon;
revoke all on table public.libraries from authenticated;
grant select, insert, update, delete on table public.libraries to authenticated;

drop policy if exists "Read own library" on public.libraries;
create policy "Read own library" on public.libraries
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Create own library" on public.libraries;
create policy "Create own library" on public.libraries
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Update own library" on public.libraries;
create policy "Update own library" on public.libraries
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Delete own library" on public.libraries;
create policy "Delete own library" on public.libraries
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

create table if not exists public.public_courses (
  owner_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, course_id),
  constraint public_course_is_object check (jsonb_typeof(data) = 'object')
);

alter table public.public_courses enable row level security;
alter table public.public_courses force row level security;

revoke all on table public.public_courses from anon;
revoke all on table public.public_courses from authenticated;
grant select on table public.public_courses to anon, authenticated;

drop policy if exists "Read public courses" on public.public_courses;
create policy "Read public courses" on public.public_courses
  for select to anon, authenticated
  using (data ->> 'visibility' = 'public');

create table if not exists public.course_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  card_id text not null,
  progress jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id, card_id),
  constraint course_progress_is_object check (jsonb_typeof(progress) = 'object')
);

alter table public.course_progress enable row level security;
alter table public.course_progress force row level security;

revoke all on table public.course_progress from anon;
revoke all on table public.course_progress from authenticated;
grant select, insert, update, delete on table public.course_progress to authenticated;

drop policy if exists "Read own course progress" on public.course_progress;
create policy "Read own course progress" on public.course_progress
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create own course progress" on public.course_progress;
create policy "Create own course progress" on public.course_progress
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Update own course progress" on public.course_progress;
create policy "Update own course progress" on public.course_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own course progress" on public.course_progress;
create policy "Delete own course progress" on public.course_progress
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_library_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_library_updated_at() from public;
drop trigger if exists set_library_updated_at on public.libraries;
create trigger set_library_updated_at
  before update on public.libraries
  for each row execute function public.set_library_updated_at();

create or replace function public.sync_public_courses()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  delete from public.public_courses where owner_id = new.owner_id;
  insert into public.public_courses (owner_id, course_id, data, updated_at)
  select new.owner_id, course.value ->> 'id', course.value, now()
  from jsonb_array_elements(new.data -> 'classes') as course(value)
  where jsonb_typeof(course.value) = 'object'
    and course.value ->> 'visibility' = 'public'
    and nullif(course.value ->> 'id', '') is not null;
  return new;
end;
$$;

revoke all on function public.sync_public_courses() from public;
drop trigger if exists sync_public_courses on public.libraries;
create trigger sync_public_courses
  after insert or update on public.libraries
  for each row execute function public.sync_public_courses();

commit;
