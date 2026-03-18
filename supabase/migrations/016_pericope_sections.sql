-- ── 016_pericope_sections.sql ────────────────────────────────────────────────
-- Stores user-defined or ESV-derived pericope section boundaries per session.
-- Format: [{ "label": "The Triumphal Entry", "startVerse": "Mark 11:1" }, ...]
-- Null = not yet defined (will auto-detect from ESV headers on load).

ALTER TABLE teaching_sessions
  ADD COLUMN IF NOT EXISTS pericope_sections jsonb DEFAULT NULL;
