-- ASSETLY database + storage setup
-- Run this entire file in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 90),
  category text not null check (category in ('PDF Notes','Books','Templates','Presets','AI Prompts','Apps & Tools','Other')),
  description text not null default '' check (char_length(description) <= 350),
  poster_url text not null,
  poster_path text not null,
  file_url text not null,
  file_path text not null,
  file_name text not null,
  file_size bigint not null default 0,
  downloads bigint not null default 0,
  featured boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists resources_published_created_idx
  on public.resources (published, created_at desc);
create index if not exists resources_category_idx on public.resources (category);

create or replace function public.is_assetly_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.resources enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_assetly_admin());

drop policy if exists "Public can read published resources" on public.resources;
create policy "Public can read published resources"
on public.resources for select to anon, authenticated
using (published = true or public.is_assetly_admin());

drop policy if exists "Admins can insert resources" on public.resources;
create policy "Admins can insert resources"
on public.resources for insert to authenticated
with check (public.is_assetly_admin());

drop policy if exists "Admins can update resources" on public.resources;
create policy "Admins can update resources"
on public.resources for update to authenticated
using (public.is_assetly_admin())
with check (public.is_assetly_admin());

drop policy if exists "Admins can delete resources" on public.resources;
create policy "Admins can delete resources"
on public.resources for delete to authenticated
using (public.is_assetly_admin());

create or replace function public.increment_resource_downloads(resource_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.resources
  set downloads = downloads + 1
  where id = resource_id and published = true;
$$;

revoke all on function public.increment_resource_downloads(uuid) from public;
grant execute on function public.increment_resource_downloads(uuid) to anon, authenticated;

grant select on public.resources to anon, authenticated;
grant insert, update, delete on public.resources to authenticated;
grant select on public.profiles to authenticated;

-- Create the public bucket used for poster images and downloadable files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assetly-files',
  'assetly-files',
  true,
  52428800,
  null
)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists "Public can read assetly files" on storage.objects;
create policy "Public can read assetly files"
on storage.objects for select to anon, authenticated
using (bucket_id = 'assetly-files');

drop policy if exists "Admins can upload assetly files" on storage.objects;
create policy "Admins can upload assetly files"
on storage.objects for insert to authenticated
with check (bucket_id = 'assetly-files' and public.is_assetly_admin());

drop policy if exists "Admins can update assetly files" on storage.objects;
create policy "Admins can update assetly files"
on storage.objects for update to authenticated
using (bucket_id = 'assetly-files' and public.is_assetly_admin())
with check (bucket_id = 'assetly-files' and public.is_assetly_admin());

drop policy if exists "Admins can delete assetly files" on storage.objects;
create policy "Admins can delete assetly files"
on storage.objects for delete to authenticated
using (bucket_id = 'assetly-files' and public.is_assetly_admin());

-- IMPORTANT: after creating your account through the website, run:
-- update public.profiles set role = 'admin' where id = 'YOUR_AUTH_USER_UUID';
-- If no profile row exists yet, insert it:
-- insert into public.profiles (id, role)
-- select id, 'admin' from auth.users where email = 'YOUR_EMAIL'
-- on conflict (id) do update set role = 'admin';
