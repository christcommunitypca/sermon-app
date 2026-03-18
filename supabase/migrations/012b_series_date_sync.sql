-- Migration 012b: Store computed date on series_sessions for conflict detection.
-- When a session is created from a series week, its scheduled_date is auto-computed
-- from series.start_date + (week_number - 1) * 7 days.
-- series_sessions.computed_date stores what the series says the date should be.
-- teaching_sessions.scheduled_date is what the teacher actually set.
-- Mismatch → conflict.

alter table public.series_sessions
  add column if not exists computed_date date;

comment on column public.series_sessions.computed_date is
  'Auto-computed: series.start_date + (week_number - 1) * 7 days. '
  'Used to detect conflicts with teaching_sessions.scheduled_date.';
