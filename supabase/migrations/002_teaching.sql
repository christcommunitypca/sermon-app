-- Migration 002: Teaching sessions, flows, outlines, outline blocks

-- ─────────────────────────────────────────────
-- Teaching sessions
-- ─────────────────────────────────────────────
create table public.teaching_sessions (
  id                  uuid primary key default uuid_generate_v4(),
  church_id           uuid not null references public.churches on delete cascade,
  teacher_id          uuid not null references auth.users on delete restrict,
  type                text not null check (type in ('sermon', 'sunday_school', 'bible_study')),
  title               text not null,
  scripture_ref       text,
  scripture_data      jsonb,    -- {book, chapter_start, verse_start, chapter_end, verse_end}
  status              text not null default 'draft'
                        check (status in ('draft', 'published', 'delivered', 'archived')),
  visibility          text not null default 'church'
                        check (visibility in ('private', 'church', 'public')),
  estimated_duration  int,      -- minutes
  notes               text,
  published_at        timestamptz,
  delivered_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.teaching_sessions is 'Core teaching unit. One row per sermon, lesson, or study.';
comment on column public.teaching_sessions.visibility is
  'private and church are enforced in MVP. public is stored but not yet surfaced in queries.';

alter table public.teaching_sessions enable row level security;

-- Draft sessions: owner only
create policy "sessions_select_draft_owner" on public.teaching_sessions
  for select using (
    status = 'draft' and teacher_id = auth.uid()
  );

-- Non-draft sessions: all active church members
create policy "sessions_select_published_members" on public.teaching_sessions
  for select using (
    status != 'draft'
    and exists (
      select 1 from public.church_members cm
      where cm.church_id = teaching_sessions.church_id
        and cm.user_id = auth.uid()
        and cm.is_active = true
    )
  );

-- Private sessions: teacher only regardless of status
create policy "sessions_select_private_owner" on public.teaching_sessions
  for select using (
    visibility = 'private' and teacher_id = auth.uid()
  );

-- Insert: teachers and above
create policy "sessions_insert_teachers" on public.teaching_sessions
  for insert with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.church_members cm
      where cm.church_id = teaching_sessions.church_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin', 'teacher')
        and cm.is_active = true
    )
  );

-- Update: owner of session
create policy "sessions_update_owner" on public.teaching_sessions
  for update using (teacher_id = auth.uid());

-- Delete: owner of session (soft-archive preferred; hard delete is fallback)
create policy "sessions_delete_owner" on public.teaching_sessions
  for delete using (teacher_id = auth.uid());

create index sessions_church_teacher_idx on public.teaching_sessions (church_id, teacher_id);
create index sessions_church_status_idx on public.teaching_sessions (church_id, status);

-- ─────────────────────────────────────────────
-- Flows (reusable outline structures)
-- ─────────────────────────────────────────────
create table public.flows (
  id              uuid primary key default uuid_generate_v4(),
  church_id       uuid not null references public.churches on delete cascade,
  teacher_id      uuid not null references auth.users on delete restrict,
  name            text not null,
  description     text,
  structure       jsonb not null default '[]', -- [{type, label, placeholder}]
  is_default_for  text check (is_default_for in ('sermon', 'sunday_school', 'bible_study', null)),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.flows is 'Named, reusable outline structures. Teacher-owned.';

alter table public.flows enable row level security;

create policy "flows_select_owner" on public.flows
  for select using (teacher_id = auth.uid());

create policy "flows_insert_teachers" on public.flows
  for insert with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.church_members cm
      where cm.church_id = flows.church_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin', 'teacher')
        and cm.is_active = true
    )
  );

create policy "flows_update_owner" on public.flows
  for update using (teacher_id = auth.uid());

create policy "flows_delete_owner" on public.flows
  for delete using (teacher_id = auth.uid());

-- ─────────────────────────────────────────────
-- Outlines (one per session)
-- ─────────────────────────────────────────────
create table public.outlines (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid not null unique references public.teaching_sessions on delete cascade,
  church_id       uuid not null references public.churches on delete cascade,
  layout_config   jsonb not null default '{}', -- {font_size_pref}
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.outlines is 'One-to-one with teaching_sessions. Holds layout preferences for delivery mode.';

alter table public.outlines enable row level security;

create policy "outlines_select_session_owner" on public.outlines
  for select using (
    exists (
      select 1 from public.teaching_sessions ts
      where ts.id = outlines.session_id
        and ts.teacher_id = auth.uid()
    )
  );

create policy "outlines_insert_session_owner" on public.outlines
  for insert with check (
    exists (
      select 1 from public.teaching_sessions ts
      where ts.id = outlines.session_id
        and ts.teacher_id = auth.uid()
    )
  );

create policy "outlines_update_session_owner" on public.outlines
  for update using (
    exists (
      select 1 from public.teaching_sessions ts
      where ts.id = outlines.session_id
        and ts.teacher_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- Outline blocks
-- ─────────────────────────────────────────────
create table public.outline_blocks (
  id                  uuid primary key default uuid_generate_v4(),
  outline_id          uuid not null references public.outlines on delete cascade,
  parent_id           uuid references public.outline_blocks on delete cascade,
  type                text not null check (
                        type in ('point', 'sub_point', 'scripture',
                                 'illustration', 'application', 'transition')
                      ),
  content             text not null default '',
  scripture_ref       text,
  position            int not null default 0,
  estimated_minutes   numeric(4,1),
  ai_source           jsonb,     -- {model, prompt_version, confidence}
  ai_edited           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.outline_blocks is
  'Flat storage of tree nodes. Tree reconstructed via parent_id + position at read time.';
comment on column public.outline_blocks.ai_source is
  'Null for human-authored blocks. {model, prompt_version, confidence} for AI-generated.';
comment on column public.outline_blocks.ai_edited is
  'True when teacher has modified AI-generated content. Changes badge from AI-generated to AI-assisted.';

alter table public.outline_blocks enable row level security;

-- Inherit access from outline (which inherits from session)
create policy "blocks_select_via_outline" on public.outline_blocks
  for select using (
    exists (
      select 1 from public.outlines o
      join public.teaching_sessions ts on ts.id = o.session_id
      where o.id = outline_blocks.outline_id
        and ts.teacher_id = auth.uid()
    )
  );

create policy "blocks_insert_via_outline" on public.outline_blocks
  for insert with check (
    exists (
      select 1 from public.outlines o
      join public.teaching_sessions ts on ts.id = o.session_id
      where o.id = outline_blocks.outline_id
        and ts.teacher_id = auth.uid()
    )
  );

create policy "blocks_update_via_outline" on public.outline_blocks
  for update using (
    exists (
      select 1 from public.outlines o
      join public.teaching_sessions ts on ts.id = o.session_id
      where o.id = outline_blocks.outline_id
        and ts.teacher_id = auth.uid()
    )
  );

create policy "blocks_delete_via_outline" on public.outline_blocks
  for delete using (
    exists (
      select 1 from public.outlines o
      join public.teaching_sessions ts on ts.id = o.session_id
      where o.id = outline_blocks.outline_id
        and ts.teacher_id = auth.uid()
    )
  );

create index blocks_outline_parent_position_idx on public.outline_blocks (outline_id, parent_id, position);
