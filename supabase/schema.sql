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

commit;
