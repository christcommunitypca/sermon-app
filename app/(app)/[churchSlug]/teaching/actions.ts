'use server'

import { getActionUser } from '@/lib/supabase/auth-context'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { ensureOutline } from '@/lib/teaching'
import { SessionType, SessionStatus, Visibility } from '@/types/database'

// ── Create session ─────────────────────────────────────────────────────────────
export async function createSessionAction(formData: FormData) {
  const user = await getActionUser()
  if (!user) return redirect('/sign-in')

  const churchId = formData.get('churchId') as string
  const churchSlug = formData.get('churchSlug') as string

  const { data: session, error } = await supabaseAdmin
    .from('teaching_sessions')
    .insert({
      church_id: churchId,
      teacher_id: user.id,
      type: formData.get('type') as SessionType,
      title: (formData.get('title') as string).trim(),
      scripture_ref: (formData.get('scripture_ref') as string)?.trim() || null,
      estimated_duration: formData.get('estimated_duration')
        ? parseInt(formData.get('estimated_duration') as string)
        : null,
      notes: (formData.get('notes') as string)?.trim() || null,
      visibility: (formData.get('visibility') as Visibility) ?? 'church',
      status: 'draft',
    })
    .select()
    .single()

  if (error || !session) {
    throw new Error(error?.message ?? 'Failed to create session')
  }

  // Auto-create an empty outline
  await ensureOutline(session.id, churchId)

  void writeAuditLog({
    churchId,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.SESSION_CREATED,
    entityType: 'session',
    entityId: session.id,
    metadata: { title: session.title, type: session.type },
  })

  redirect(`/${churchSlug}/teaching/${session.id}`)
}

// ── Update session ─────────────────────────────────────────────────────────────
export async function updateSessionAction(formData: FormData) {
  const user = await getActionUser()
  if (!user) return redirect('/sign-in')

  const sessionId = formData.get('sessionId') as string
  const churchSlug = formData.get('churchSlug') as string

  const updates: Record<string, unknown> = {
    title: (formData.get('title') as string).trim(),
    type: formData.get('type') as SessionType,
    scripture_ref: (formData.get('scripture_ref') as string)?.trim() || null,
    scheduled_date: (formData.get('scheduled_date') as string)?.trim() || null,
    estimated_duration: formData.get('estimated_duration')
      ? parseInt(formData.get('estimated_duration') as string)
      : null,
    notes: (formData.get('notes') as string)?.trim() || null,
    visibility: (formData.get('visibility') as Visibility) ?? 'church',
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabaseAdmin
    .from('teaching_sessions')
    .update(updates)
    .eq('id', sessionId)
    .eq('teacher_id', user.id)

  if (error) throw new Error(error.message)

  redirect(`/${churchSlug}/teaching/${sessionId}`)
}

// ── Update session status ──────────────────────────────────────────────────────
export async function updateSessionStatusAction(
  sessionId: string,
  churchId: string,
  churchSlug: string,
  newStatus: SessionStatus
) {
  const user = await getActionUser()
  if (!user) return redirect('/sign-in')

  const statusUpdates: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }

  if (newStatus === 'published') statusUpdates.published_at = new Date().toISOString()
  if (newStatus === 'delivered') statusUpdates.delivered_at = new Date().toISOString()

  const { error } = await supabaseAdmin
    .from('teaching_sessions')
    .update(statusUpdates)
    .eq('id', sessionId)
    .eq('teacher_id', user.id)

  if (error) throw new Error(error.message)

  void writeAuditLog({
    churchId,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.SESSION_STATUS_CHANGED,
    entityType: 'session',
    entityId: sessionId,
    metadata: { new_status: newStatus },
  })

  revalidatePath(`/${churchSlug}/teaching/${sessionId}`)
  revalidatePath(`/${churchSlug}/teaching`)
}

// ── Archive session ────────────────────────────────────────────────────────────
// Archive is the primary removal action. Sets status to 'archived'.
export async function archiveSessionAction(
  sessionId: string,
  churchId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { error } = await supabaseAdmin
    .from('teaching_sessions')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('teacher_id', user.id)

  if (error) return { error: error.message }

  void writeAuditLog({
    churchId,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.SESSION_STATUS_CHANGED,
    entityType: 'session',
    entityId: sessionId,
    metadata: { new_status: 'archived' },
  })

  revalidatePath(`/${churchSlug}/teaching`)
  revalidatePath(`/${churchSlug}/teaching/${sessionId}`)
  return {}
}

// ── Unarchive session ──────────────────────────────────────────────────────────
export async function unarchiveSessionAction(
  sessionId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { error } = await supabaseAdmin
    .from('teaching_sessions')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('teacher_id', user.id)
    .eq('status', 'archived')   // only unarchive if actually archived

  if (error) return { error: error.message }

  revalidatePath(`/${churchSlug}/teaching`)
  revalidatePath(`/${churchSlug}/teaching/${sessionId}`)
  return {}
}

// ── Delete session ─────────────────────────────────────────────────────────────
// Delete is restricted: session must be archived first.
// This enforces the archive-before-delete pattern.
export async function deleteSessionAction(
  sessionId: string,
  churchId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  // Verify session is archived before allowing deletion
  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('status, teacher_id')
    .eq('id', sessionId)
    .single()

  if (!session || session.teacher_id !== user.id) return { error: 'Not found' }
  if (session.status !== 'archived') {
    return { error: 'Archive this session before deleting it.' }
  }

  const { error } = await supabaseAdmin
    .from('teaching_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('teacher_id', user.id)

  if (error) return { error: error.message }

  void writeAuditLog({
    churchId,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.SESSION_DELETED,
    entityType: 'session',
    entityId: sessionId,
    metadata: { was_archived: true },
  })

  redirect(`/${churchSlug}/teaching`)
}

