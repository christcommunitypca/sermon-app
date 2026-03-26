-- Phase B: church-shared vs personal flow ownership

alter table public.flows
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

comment on column public.flows.owner_user_id is
  'Null means church-shared guidance flow. Non-null means personal flow owned by a specific user.';

-- Treat existing flows as personal by default.
update public.flows
set owner_user_id = teacher_id
where owner_user_id is null;

-- Preserve existing defaults for churches by cloning one shared copy where needed.
insert into public.flows (
  church_id,
  teacher_id,
  owner_user_id,
  name,
  description,
  explanation,
  steps,
  recommended_for,
  is_default_for,
  is_archived,
  archived_at,
  tradition_tags,
  style_tags,
  influenced_by
)
select
  f.church_id,
  f.teacher_id,
  null,
  f.name,
  f.description,
  f.explanation,
  f.steps,
  f.recommended_for,
  f.is_default_for,
  false,
  null,
  coalesce(f.tradition_tags, '{}'::text[]),
  coalesce(f.style_tags, '{}'::text[]),
  coalesce(f.influenced_by, '{}'::text[])
from public.flows f
where f.owner_user_id is not null
  and f.is_default_for is not null
  and not exists (
    select 1
    from public.flows shared
    where shared.church_id = f.church_id
      and shared.owner_user_id is null
      and shared.is_default_for = f.is_default_for
      and shared.is_archived = false
  );

drop index if exists flows_one_active_default_per_type;

create unique index if not exists flows_one_personal_default_per_type
  on public.flows(church_id, owner_user_id, is_default_for)
  where owner_user_id is not null and is_default_for is not null and is_archived = false;

create unique index if not exists flows_one_shared_default_per_type
  on public.flows(church_id, is_default_for)
  where owner_user_id is null and is_default_for is not null and is_archived = false;

create index if not exists flows_owner_user_idx
  on public.flows(owner_user_id);
