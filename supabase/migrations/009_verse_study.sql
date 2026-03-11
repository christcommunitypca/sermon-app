-- Migration 009: Verse-by-verse study — verse notes, AI insights, scripture cache

-- ── scripture_cache ────────────────────────────────────────────────────────────
-- Cached ESV passage text. Keyed by normalized ref string.
-- No RLS needed — this is read-only shared data, no user-specific content.
create table public.scripture_cache (
  ref         text primary key,   -- e.g. "John 3:1-21"
  translation text not null default 'ESV',
  passages    jsonb not null,     -- [{verse_ref, verse_num, text}]
  fetched_at  timestamptz not null default now()
);
comment on table public.scripture_cache is
  'Cached scripture text from ESV API. Shared across all users. TTL enforced in application code.';

-- ── verse_notes ────────────────────────────────────────────────────────────────
-- Personal notes attached to a specific verse within a teaching session.
create table public.verse_notes (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.teaching_sessions(id) on delete cascade,
  church_id   uuid not null references public.churches(id) on delete cascade,
  teacher_id  uuid not null references auth.users(id) on delete cascade,
  verse_ref   text not null,     -- e.g. "John 3:16"
  content     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(session_id, verse_ref)
);
comment on table public.verse_notes is
  'Teacher notes per verse. One row per (session, verse). Upserted on save.';

create index verse_notes_session_idx on public.verse_notes(session_id);

alter table public.verse_notes enable row level security;

create policy "verse_notes_teacher_own" on public.verse_notes
  for all using (teacher_id = auth.uid());

-- ── verse_insights ─────────────────────────────────────────────────────────────
-- AI-generated insights per verse per category. One generation covers the full
-- passage in a single AI call; results are stored per-verse per-category.
create table public.verse_insights (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.teaching_sessions(id) on delete cascade,
  church_id    uuid not null references public.churches(id) on delete cascade,
  teacher_id   uuid not null references auth.users(id) on delete cascade,
  verse_ref    text not null,
  category     text not null check (category in (
                 'word_study', 'cross_refs', 'practical',
                 'theology_by_tradition', 'context', 'application'
               )),
  items        jsonb not null default '[]',  -- [{title: string, content: string}]
  model        text,
  prompt_version text,
  generated_at timestamptz not null default now(),
  unique(session_id, verse_ref, category)
);
comment on table public.verse_insights is
  'AI-generated insights per verse per category. Max 5 items per row. '
  'Generated in a single call covering the full passage.';

create index verse_insights_session_idx on public.verse_insights(session_id);
create index verse_insights_verse_idx on public.verse_insights(session_id, verse_ref);

alter table public.verse_insights enable row level security;

create policy "verse_insights_teacher_own" on public.verse_insights
  for all using (teacher_id = auth.uid());

-- ── Extend teaching_sessions ───────────────────────────────────────────────────
-- Track which mode the teacher was last using for this session.
alter table public.teaching_sessions
  add column if not exists teaching_mode text default 'outline'
    check (teaching_mode in ('verse_by_verse', 'outline'));

-- ── Extend series_sessions ─────────────────────────────────────────────────────
-- Store ESV scripture text fetched at series generation time, per week.
alter table public.series_sessions
  add column if not exists scripture_text jsonb;  -- [{verse_ref, verse_num, text}]

comment on column public.series_sessions.scripture_text is
  'Cached ESV passage text for this week. Fetched when series is generated or on first view.';
