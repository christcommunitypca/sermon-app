-- Migration 016: Add 'quotes' to verse_insights category constraint
-- Quotes = historical theologian quotes from the teacher's tradition

alter table public.verse_insights
  drop constraint if exists verse_insights_category_check;

alter table public.verse_insights
  add constraint verse_insights_category_check
  check (category in (
    'word_study', 'cross_refs', 'practical',
    'theology_by_tradition', 'context', 'application', 'quotes'
  ));
