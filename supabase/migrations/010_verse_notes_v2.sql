-- Migration 010: Rebuild verse_notes as multi-note per verse
-- Replaces the single-note-per-verse model from 009 with one row per note,
-- supporting multiple ordered notes per verse, reordering, and usage tracking.

-- ── Drop old verse_notes table ──────────────────────────────────────────────
-- Safe: only existed as a single-text-per-verse store, no downstream FK references.
drop table if exists public.verse_notes cascade;

-- ── New verse_notes table ────────────────────────────────────────────────────
create table public.verse_notes (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.teaching_sessions(id) on delete cascade,
  church_id   uuid not null references public.churches(id) on delete cascade,
  teacher_id  uuid not null references auth.users(id) on delete cascade,
  verse_ref   text not null,       -- e.g. "John 3:16"
  content     text not null default '',
  position    integer not null default 0,  -- ordering within verse, 0-based
  used_count  integer not null default 0,  -- how many times placed in outline
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
  -- no unique constraint: multiple notes allowed per (session, verse)
);

comment on table public.verse_notes is
  'Teacher notes per verse. Multiple notes per verse allowed. Ordered by position. '
  'used_count tracks how many times placed in outline (0 = unused, >0 = used).';

create index verse_notes_session_idx    on public.verse_notes(session_id);
create index verse_notes_verse_idx      on public.verse_notes(session_id, verse_ref);
create index verse_notes_position_idx   on public.verse_notes(session_id, verse_ref, position);

alter table public.verse_notes enable row level security;

create policy "verse_notes_teacher_own" on public.verse_notes
  for all using (teacher_id = auth.uid());

-- ── Default teaching mode: verse_by_verse ────────────────────────────────────
-- Change the default so new sessions open in verse_by_verse mode.
-- Existing sessions with explicit teaching_mode values are unaffected.
alter table public.teaching_sessions
  alter column teaching_mode set default 'verse_by_verse';
