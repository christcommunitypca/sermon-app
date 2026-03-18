-- Migration 003: Thought captures, version snapshots, tags, search, notifications, imports

-- ─────────────────────────────────────────────
-- Thought captures
-- ─────────────────────────────────────────────
create table public.thought_captures (
  id                    uuid primary key default uuid_generate_v4(),
  session_id            uuid not null references public.teaching_sessions on delete cascade,
  church_id             uuid not null references public.churches on delete cascade,
  type                  text not null check (type in ('text', 'audio')),
  content               text,         -- text content; null for audio
  storage_path          text,         -- supabase storage path; null for text
  file_name             text,
  file_size_bytes       bigint,
  duration_seconds      int,
  transcription_status  text not null default 'none'
                          check (transcription_status in ('none', 'pending', 'complete', 'failed')),
  created_at            timestamptz not null default now()
);
comment on table public.thought_captures is
  'Raw inputs attached to a session. Transcription deferred — transcription_status will be none in MVP.';

alter table public.thought_captures enable row level security;

create policy "thoughts_owner_only" on public.thought_captures
  for all using (
    exists (
      select 1 from public.teaching_sessions ts
      where ts.id = thought_captures.session_id
        and ts.teacher_id = auth.uid()
    )
  );

create index thoughts_session_idx on public.thought_captures (session_id);

-- ─────────────────────────────────────────────
-- Version snapshots — TWO NARROW TABLES
-- Never merge into a generic version_snapshots table in MVP.
-- ─────────────────────────────────────────────

-- Session metadata snapshot
create table public.session_snapshots (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid not null references public.teaching_sessions on delete cascade,
  church_id       uuid not null references public.churches on delete cascade,
  version_number  int not null,
  label           text,     -- null for auto-snapshots; set for manual saves
  -- Captured fields: title, scripture_ref, scripture_data, type, status, visibility,
  --                  estimated_duration, notes, confirmed tag IDs
  data            jsonb not null,
  created_by      uuid references auth.users on delete set null,
  created_at      timestamptz not null default now(),
  unique (session_id, version_number)
);
comment on table public.session_snapshots is
  'Point-in-time snapshot of session metadata. Always created paired with outline_snapshots in a single transaction.';
comment on column public.session_snapshots.version_number is
  'Per-session sequence. Assigned as MAX(version_number)+1 within the insert transaction.';
comment on column public.session_snapshots.label is
  'null = auto-snapshot (pruned after 20 per session). set = manual (kept forever).';

alter table public.session_snapshots enable row level security;

create policy "session_snapshots_owner_admin" on public.session_snapshots
  for select using (
    exists (
      select 1 from public.teaching_sessions ts
      where ts.id = session_snapshots.session_id
        and ts.teacher_id = auth.uid()
    )
    or exists (
      select 1 from public.church_members cm
      where cm.church_id = session_snapshots.church_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
        and cm.is_active = true
    )
  );

create index session_snapshots_session_idx on public.session_snapshots (session_id, version_number desc);

-- Outline block tree snapshot
create table public.outline_snapshots (
  id              uuid primary key default uuid_generate_v4(),
  outline_id      uuid not null references public.outlines on delete cascade,
  session_id      uuid not null references public.teaching_sessions on delete cascade,
  church_id       uuid not null references public.churches on delete cascade,
  version_number  int not null,   -- must match paired session_snapshot version_number
  label           text,           -- copied from paired session_snapshot
  -- Full OutlineBlock[] tree. parent_id references intact. ai_source + ai_edited included.
  blocks          jsonb not null,
  created_by      uuid references auth.users on delete set null,
  created_at      timestamptz not null default now(),
  unique (outline_id, version_number)
);
comment on table public.outline_snapshots is
  'Point-in-time snapshot of the full outline block tree. Always created paired with session_snapshots.';

alter table public.outline_snapshots enable row level security;

create policy "outline_snapshots_owner_admin" on public.outline_snapshots
  for select using (
    exists (
      select 1 from public.teaching_sessions ts
      where ts.id = outline_snapshots.session_id
        and ts.teacher_id = auth.uid()
    )
    or exists (
      select 1 from public.church_members cm
      where cm.church_id = outline_snapshots.church_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
        and cm.is_active = true
    )
  );

create index outline_snapshots_session_idx on public.outline_snapshots (session_id, version_number desc);

-- ─────────────────────────────────────────────
-- Tags
-- ─────────────────────────────────────────────
create table public.tag_taxonomies (
  id          uuid primary key default uuid_generate_v4(),
  church_id   uuid not null references public.churches on delete cascade,
  name        text not null,
  slug        text not null,
  is_system   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (church_id, slug)
);
comment on table public.tag_taxonomies is
  'Seven system taxonomies seeded per church: scripture, doctrine, theme, audience, season, teaching_type, tradition.';

alter table public.tag_taxonomies enable row level security;

create policy "taxonomies_select_members" on public.tag_taxonomies
  for select using (
    exists (
      select 1 from public.church_members cm
      where cm.church_id = tag_taxonomies.church_id
        and cm.user_id = auth.uid()
        and cm.is_active = true
    )
  );

create table public.tags (
  id            uuid primary key default uuid_generate_v4(),
  church_id     uuid not null references public.churches on delete cascade,
  taxonomy_id   uuid not null references public.tag_taxonomies on delete cascade,
  label         text not null,
  slug          text not null,
  created_at    timestamptz not null default now(),
  unique (church_id, taxonomy_id, slug)
);

alter table public.tags enable row level security;

create policy "tags_select_members" on public.tags
  for select using (
    exists (
      select 1 from public.church_members cm
      where cm.church_id = tags.church_id
        and cm.user_id = auth.uid()
        and cm.is_active = true
    )
  );

create policy "tags_insert_teachers" on public.tags
  for insert with check (
    exists (
      select 1 from public.church_members cm
      where cm.church_id = tags.church_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin', 'teacher')
        and cm.is_active = true
    )
  );

create table public.content_tags (
  id                uuid primary key default uuid_generate_v4(),
  church_id         uuid not null references public.churches on delete cascade,
  session_id        uuid not null references public.teaching_sessions on delete cascade,
  tag_id            uuid not null references public.tags on delete cascade,
  is_ai_suggested   boolean not null default false,
  confirmed         boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (session_id, tag_id)
);

alter table public.content_tags enable row level security;

create policy "content_tags_session_owner" on public.content_tags
  for all using (
    exists (
      select 1 from public.teaching_sessions ts
      where ts.id = content_tags.session_id
        and ts.teacher_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- Search index
-- ─────────────────────────────────────────────
create table public.search_index (
  id              uuid primary key default uuid_generate_v4(),
  church_id       uuid not null references public.churches on delete cascade,
  entity_type     text not null,   -- 'session' in MVP
  entity_id       uuid not null,
  teacher_id      uuid not null references auth.users on delete cascade,
  search_vector   tsvector,
  -- visibility stored now; not used in MVP queries.
  -- MVP queries always filter teacher_id = auth.uid()
  visibility      text not null default 'church'
                    check (visibility in ('private', 'church', 'public')),
  updated_at      timestamptz not null default now(),
  unique (entity_type, entity_id)
);
comment on column public.search_index.visibility is
  'Stored for future use. MVP queries ignore this — all results filtered to teacher_id = auth.uid().';

alter table public.search_index enable row level security;

-- MVP: teacher can only search their own content
create policy "search_index_teacher_own" on public.search_index
  for select using (teacher_id = auth.uid());

create index search_index_vector_idx on public.search_index using gin(search_vector);
create index search_index_teacher_idx on public.search_index (teacher_id);

-- ─────────────────────────────────────────────
-- Notifications
-- ─────────────────────────────────────────────
create table public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  church_id   uuid not null references public.churches on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  category    text not null check (category in ('teaching', 'system')),
  title       text not null,
  body        text,
  action_url  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "notifications_owner_only" on public.notifications
  for all using (user_id = auth.uid());

create index notifications_user_unread_idx on public.notifications (user_id, read_at) where read_at is null;

create table public.notification_prefs (
  id              uuid primary key default uuid_generate_v4(),
  church_id       uuid not null references public.churches on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  email_enabled   boolean not null default true,
  updated_at      timestamptz not null default now(),
  unique (church_id, user_id)
);

alter table public.notification_prefs enable row level security;

create policy "notification_prefs_owner_only" on public.notification_prefs
  for all using (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- Imports
-- ─────────────────────────────────────────────
create table public.imports (
  id                uuid primary key default uuid_generate_v4(),
  church_id         uuid not null references public.churches on delete cascade,
  teacher_id        uuid not null references auth.users on delete restrict,
  source_type       text not null check (source_type in ('text_paste', 'txt', 'docx')),
  original_content  text,
  parsed_outline    jsonb,
  status            text not null default 'pending'
                      check (status in ('pending', 'reviewed', 'applied', 'discarded')),
  session_id        uuid references public.teaching_sessions on delete set null,
  created_at        timestamptz not null default now()
);
comment on table public.imports is
  'Import records for paste/file imports. Parser is deferred — parsed_outline will be null initially.';

alter table public.imports enable row level security;

create policy "imports_teacher_only" on public.imports
  for all using (teacher_id = auth.uid());
