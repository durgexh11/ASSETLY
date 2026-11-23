-- ASSETLY action types migration
-- Run once in Supabase SQL Editor AFTER your existing ASSETLY schema.
-- Existing resource rows and their current download files are preserved.
begin;

alter table public.resources
  alter column file_url drop not null,
  alter column file_path drop not null,
  alter column file_name drop not null;

alter table public.resources
  add column if not exists action_type text not null default 'download',
  add column if not exists action_url text,
  add column if not exists copy_content text,
  add column if not exists action_label text not null default 'Download now';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'resources_action_type_check'
      and conrelid = 'public.resources'::regclass
  ) then
    alter table public.resources
      add constraint resources_action_type_check
      check (action_type in ('download','visit','copy'));
  end if;
end $$;

commit;
