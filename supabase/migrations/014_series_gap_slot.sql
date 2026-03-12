-- Migration 014: Add is_gap_slot to series_sessions.
-- Distinguishes rows inserted as blank gaps (skip-with-push, standalone guest)
-- from original content rows that were merely tagged as skipped/guest.
-- This fixes restore logic: gap rows are deleted + weeks renumber back;
-- content rows are just un-tagged.

alter table public.series_sessions
  add column if not exists is_gap_slot boolean not null default false;

comment on column public.series_sessions.is_gap_slot is
  'True for rows inserted as blank placeholders (skip-with-push, standalone guest). '
  'False for original series content rows. Used to determine restore behavior.';
