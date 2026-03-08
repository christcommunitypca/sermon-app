'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { ensureOutline } from '@/lib/teaching'
import { SessionType, SessionStatus, Visibility } from '@/types/database'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')
  return user!
}

// ── Create session ─────────────────────────────────────────────────────────────
export async function createSessionAction(formData: FormData) {
  const user = await getAuthContext()

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
  const user = await getAuthContext()

  const sessionId = formData.get('sessionId') as string
  const churchSlug = formData.get('churchSlug') as string

  const updates: Record<string, unknown> = {
    title: (formData.get('title') as string).trim(),
    type: formData.get('type') as SessionType,
    scripture_ref: (formData.get('scripture_ref') as string)?.trim() || null,
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

  revalidatePath(`/${churchSlug}/teaching/${sessionId}`)
}

// ── Update session status ──────────────────────────────────────────────────────
export async function updateSessionStatusAction(
  sessionId: string,
  churchId: string,
  churchSlug: string,
  newStatus: SessionStatus
) {
  const user = await getAuthContext()

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

// ── Delete session ─────────────────────────────────────────────────────────────
export async function deleteSessionAction(sessionId: string, churchId: string, churchSlug: string) {
  const user = await getAuthContext()

  const { error } = await supabaseAdmin
    .from('teaching_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('teacher_id', user.id)

  if (error) throw new Error(error.message)

  void writeAuditLog({
    churchId,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.SESSION_DELETED,
    entityType: 'session',
    entityId: sessionId,
  })

  redirect(`/${churchSlug}/teaching`)
}
