-- ── 017_teaching_mode_pericope.sql ───────────────────────────────────────────
-- Allow pericope mode to persist on teaching sessions.

ALTER TABLE public.teaching_sessions
  DROP CONSTRAINT IF EXISTS teaching_sessions_teaching_mode_check;

ALTER TABLE public.teaching_sessions
  ADD CONSTRAINT teaching_sessions_teaching_mode_check
  CHECK (teaching_mode IN ('verse_by_verse', 'outline', 'pericope'));
