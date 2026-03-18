-- Migration 015: Add used_count to research_items
-- Tracks how many times a research item has been placed into an outline.

alter table public.research_items
  add column if not exists used_count integer not null default 0;

comment on column public.research_items.used_count is
  'Number of times this item has been placed into the outline. 0 = never used.';

-- RPC helpers for atomic increments (avoids race conditions)
create or replace function public.increment_note_used_count(note_id uuid)
returns void language sql security definer as $$
  update public.verse_notes set used_count = used_count + 1 where id = note_id;
$$;

create or replace function public.increment_research_used_count(item_id uuid)
returns void language sql security definer as $$
  update public.research_items set used_count = used_count + 1 where id = item_id;
$$;
