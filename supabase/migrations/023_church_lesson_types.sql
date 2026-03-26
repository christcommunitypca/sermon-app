create table if not exists public.church_lesson_types (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  key text not null,
  label text not null,
  description text null,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  default_flow_id uuid null references public.flows(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (church_id, key)
);

create index if not exists church_lesson_types_church_idx on public.church_lesson_types(church_id, sort_order);

insert into public.church_lesson_types (church_id, key, label, description, is_enabled, sort_order)
select c.id, v.key, v.label, v.description, true, v.sort_order
from public.churches c
cross join (
  values
    ('sermon', 'Sermon', 'Primary preaching gatherings', 10),
    ('sunday_school', 'Sunday School', 'Classroom or group teaching', 20),
    ('bible_study', 'Bible Study', 'Midweek or small-group study', 30)
) as v(key, label, description, sort_order)
where not exists (
  select 1 from public.church_lesson_types t where t.church_id = c.id and t.key = v.key
);
