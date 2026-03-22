-- ── 018_sermon_flows_v2.sql ────────────────────────────────────────────────
-- Evolve reusable flows into full sermon-flow definitions
-- and allow explicit flow selection per teaching session.

alter table public.flows
  add column if not exists explanation text,
  add column if not exists recommended_for text[] not null default '{}',
  add column if not exists steps jsonb;

update public.flows
set steps = coalesce(steps, structure, '[]'::jsonb)
where steps is null;

alter table public.flows
  alter column steps set not null,
  alter column steps set default '[]'::jsonb;

alter table public.teaching_sessions
  add column if not exists selected_flow_id uuid references public.flows(id) on delete set null,
  add column if not exists selected_flow_snapshot jsonb;

create index if not exists teaching_sessions_selected_flow_idx
  on public.teaching_sessions(selected_flow_id);

create unique index if not exists flows_one_active_default_per_type
  on public.flows(church_id, teacher_id, is_default_for)
  where is_default_for is not null and is_archived = false;
