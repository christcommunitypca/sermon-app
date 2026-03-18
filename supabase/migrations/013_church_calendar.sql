-- Migration 013: Church Calendar
-- Global calendar events that affect teaching series scheduling.
-- Two types: recurring (computed annually) and one_time (manual date).
-- Each event can have a different scheduling impact per service type.

-- ── Church calendar events ─────────────────────────────────────────────────────
create table if not exists public.church_calendar_events (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.churches(id) on delete cascade,
  created_by    uuid not null references auth.users(id) on delete cascade,

  name          text not null,                    -- e.g. "Easter Sunday", "Church Retreat"
  description   text,
  event_type    text not null default 'one_time'
                  check (event_type in ('recurring', 'one_time')),
  recurrence_key text,                            -- e.g. 'easter', 'christmas', 'advent_start',
                                                  --   'palm_sunday', 'reformation_sunday'
                                                  -- null for custom recurring or one_time
  event_date    date,                             -- for one_time events
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Per-service-type scheduling impact ────────────────────────────────────────
-- For each event, each service type can have a different response.
create table if not exists public.calendar_service_impacts (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.church_calendar_events(id) on delete cascade,
  service_type    text not null,                  -- 'sermon_am' | 'sermon_pm' | 'sunday_school' | 'bible_study' | etc.
  impact          text not null default 'informational'
                    check (impact in ('informational', 'skip', 'replace')),
  -- 'informational' = show on timeline, series continues unaffected
  -- 'skip'          = that week becomes a gap, series shifts out
  -- 'replace'       = that date becomes this event (e.g. Christmas message), counts as a series slot
  notes           text,
  created_at      timestamptz not null default now(),
  unique(event_id, service_type)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists calendar_events_church_idx
  on public.church_calendar_events(church_id, is_active);
create index if not exists calendar_events_date_idx
  on public.church_calendar_events(event_date);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.church_calendar_events enable row level security;
alter table public.calendar_service_impacts enable row level security;

create policy "church members can read calendar events"
  on public.church_calendar_events for select
  using (
    exists (
      select 1 from public.church_members
      where church_id = church_calendar_events.church_id
        and user_id = auth.uid()
    )
  );

create policy "church members can manage their church calendar"
  on public.church_calendar_events for all
  using (
    exists (
      select 1 from public.church_members
      where church_id = church_calendar_events.church_id
        and user_id = auth.uid()
    )
  );

create policy "church members can read service impacts"
  on public.calendar_service_impacts for select
  using (
    exists (
      select 1 from public.church_calendar_events e
      join public.church_members m on m.church_id = e.church_id
      where e.id = calendar_service_impacts.event_id
        and m.user_id = auth.uid()
    )
  );

create policy "church members can manage service impacts"
  on public.calendar_service_impacts for all
  using (
    exists (
      select 1 from public.church_calendar_events e
      join public.church_members m on m.church_id = e.church_id
      where e.id = calendar_service_impacts.event_id
        and m.user_id = auth.uid()
    )
  );

comment on table public.church_calendar_events is
  'Global church calendar. Recurring events are computed per-year; one_time events have a fixed date. '
  'Scheduling impact is set per service type in calendar_service_impacts.';
comment on column public.church_calendar_events.recurrence_key is
  'Built-in keys: easter | christmas | advent_start | palm_sunday | reformation_sunday. '
  'Custom recurring events have a null recurrence_key and use event_date as anchor.';
