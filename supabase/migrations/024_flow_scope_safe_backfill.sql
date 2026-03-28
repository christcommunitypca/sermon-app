-- Safe follow-up migration for environments where flows already exist
-- but owner_user_id and the new default-per-scope indexes do not.

alter table public.flows
  add column if not exists owner_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'flows_owner_user_id_fkey'
      and conrelid = 'public.flows'::regclass
  ) then
    alter table public.flows
      add constraint flows_owner_user_id_fkey
      foreign key (owner_user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end $$;

comment on column public.flows.owner_user_id is
  'Null means church-shared guidance flow. Non-null means personal flow owned by a specific user.';

update public.flows
set owner_user_id = teacher_id
where owner_user_id is null;

drop index if exists public.flows_one_active_default_per_type;

create unique index if not exists flows_one_personal_default_per_type
  on public.flows(church_id, owner_user_id, is_default_for)
  where owner_user_id is not null and is_default_for is not null and is_archived = false;

create unique index if not exists flows_one_shared_default_per_type
  on public.flows(church_id, is_default_for)
  where owner_user_id is null and is_default_for is not null and is_archived = false;

create index if not exists flows_owner_user_idx
  on public.flows(owner_user_id);
