-- ── Migration 005: Series planning + Research workspace ──────────────────────

-- ── Theological tradition on user profile ──────────────────────────────────────
alter table public.profiles
  add column if not exists theological_tradition text default 'nondenominational';

-- ── Series ─────────────────────────────────────────────────────────────────────
create table if not exists public.series (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.churches(id) on delete cascade,
  teacher_id    uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  description   text,
  scripture_section text,                     -- e.g. "Romans 1-8"
  total_weeks   int,
  start_date    date,
  tradition     text,                         -- snapshot of tradition at creation time
  status        text not null default 'planning'
                  check (status in ('planning','active','completed','archived')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists series_church_teacher_idx on public.series(church_id, teacher_id);

-- ── Series sessions (proposed week-by-week plan) ───────────────────────────────
create table if not exists public.series_sessions (
  id                uuid primary key default gen_random_uuid(),
  series_id         uuid not null references public.series(id) on delete cascade,
  session_id        uuid references public.teaching_sessions(id) on delete set null,
  week_number       int not null,
  proposed_title    text,
  proposed_scripture text,
  notes             text,
  liturgical_note   text,                     -- AI-generated note about liturgical context
  status            text not null default 'planned'
                      check (status in ('planned','created','delivered')),
  created_at        timestamptz not null default now(),
  unique(series_id, week_number)
);

create index if not exists series_sessions_series_idx on public.series_sessions(series_id);
create index if not exists series_sessions_session_idx on public.series_sessions(session_id);

-- ── Research items ─────────────────────────────────────────────────────────────
-- Research items belong to a teaching session. One row per generated insight.
-- category values: word_study | related_text | theological | practical | historical
--                  | denominational | current_topic
-- source_type values: ai_synthesis | sourced | user
create table if not exists public.research_items (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.teaching_sessions(id) on delete cascade,
  church_id           uuid not null references public.churches(id) on delete cascade,
  teacher_id          uuid not null references auth.users(id) on delete cascade,
  category            text not null,
  subcategory         text,                   -- e.g. 'word', 'cross_ref_common', 'application', etc.
  title               text not null,
  content             text not null,
  source_label        text not null,          -- human-readable provenance
  source_type         text not null default 'ai_synthesis'
                        check (source_type in ('ai_synthesis','sourced','user')),
  confidence          text check (confidence in ('high','medium','low')),
  is_pinned           boolean not null default false,
  is_dismissed        boolean not null default false,
  metadata            jsonb not null default '{}',
  position            int not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists research_items_session_idx on public.research_items(session_id);
create index if not exists research_items_category_idx on public.research_items(session_id, category);

-- ── RLS: keep everything behind existing auth patterns ─────────────────────────
-- We use supabaseAdmin in server code; RLS is a safety net.
alter table public.series enable row level security;
alter table public.series_sessions enable row level security;
alter table public.research_items enable row level security;

-- Series: teachers see their own
create policy "series_teacher_own" on public.series
  using (teacher_id = auth.uid());

create policy "series_sessions_via_series" on public.series_sessions
  using (series_id in (select id from public.series where teacher_id = auth.uid()));

create policy "research_items_teacher_own" on public.research_items
  using (teacher_id = auth.uid());
