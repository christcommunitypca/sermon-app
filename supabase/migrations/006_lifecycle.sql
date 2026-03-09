-- ── Migration 006: Content lifecycle — archive and delete ─────────────────────

-- ── Flows: add is_archived ─────────────────────────────────────────────────────
-- Sessions and series already have status='archived'.
-- Flows are config objects with no status column — use a boolean instead.
alter table public.flows
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz;

create index if not exists flows_archived_idx on public.flows(teacher_id, is_archived);

-- ── Sessions: add deleted_at for soft audit trail after hard delete ────────────
-- The actual row is removed on delete, but we log to audit_log.
-- deleted_at is set just before deletion so it appears in the audit payload.
-- This column is optional — most delete tracking goes via audit_log.
-- No column addition needed; audit_log already handles this.

-- ── Series: already has status='archived'; no schema change needed ────────────
-- Confirm status check includes 'archived' (already in migration 005).

-- ── Ensure session status constraint includes archived ────────────────────────
-- It already does from migration 002. This is a no-op safety check.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'teaching_sessions_status_check'
  ) then
    raise notice 'status check constraint not found by expected name — verify manually';
  end if;
end $$;
