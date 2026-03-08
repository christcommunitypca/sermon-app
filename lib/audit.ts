import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'

// ── Audit action constants ────────────────────────────────────────────────────
// Use these constants — never raw strings — so the log is queryable.
export const AUDIT_ACTIONS = {
  // Teaching
  SESSION_CREATED:          'session.created',
  SESSION_STATUS_CHANGED:   'session.status_changed',
  SESSION_DELETED:          'session.deleted',
  // Snapshots
  SNAPSHOT_CREATED:         'snapshot.created',
  SNAPSHOT_RESTORED:        'snapshot.restored',
  // AI key
  AI_KEY_SAVED:             'ai_key.saved',
  AI_KEY_REMOVED:           'ai_key.removed',
  AI_KEY_VALIDATED:         'ai_key.validated',
  // Members / roles
  MEMBER_ROLE_CHANGED:      'member.role_changed',
  MEMBER_DEACTIVATED:       'member.deactivated',
  // Import
  IMPORT_APPLIED:           'import.applied',
} as const

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS]

interface AuditWriteParams {
  churchId: string
  actorUserId: string | null
  action: AuditAction
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
}

// ── writeAuditLog ─────────────────────────────────────────────────────────────
// Fire-and-forget. Always server-side. Never throws — audit failure must not
// block the primary operation.
export async function writeAuditLog({
  churchId,
  actorUserId,
  action,
  entityType,
  entityId,
  metadata = {},
}: AuditWriteParams): Promise<void> {
  try {
    await supabaseAdmin.from('audit_log').insert({
      church_id: churchId,
      actor_user_id: actorUserId,
      action,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      metadata,
    })
  } catch (err) {
    // Log to server console but never surface to caller
    console.error('[audit_log] write failed:', err)
  }
}
