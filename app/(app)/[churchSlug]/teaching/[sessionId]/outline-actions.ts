'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createSnapshotPair } from '@/lib/snapshots'
import { ensureOutline, getSessionWithOutline } from '@/lib/teaching'
import { OutlineBlock, SessionSnapshotData } from '@/types/database'
import { normalizePositions } from '@/lib/outline'

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')
  return user!
}

// ── Save full block tree (replaces all blocks for this outline) ────────────────
// This is the primary save path. Client sends the full current state.
export async function saveBlocksAction(
  outlineId: string,
  sessionId: string,
  churchId: string,
  blocks: Omit<OutlineBlock, 'created_at' | 'updated_at'>[]
): Promise<{ error?: string }> {
  const user = await getAuthUser()

  // Verify ownership
  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('teacher_id')
    .eq('id', sessionId)
    .single()

  if (session?.teacher_id !== user.id) return { error: 'Unauthorized' }

  const now = new Date().toISOString()
  const normalized = normalizePositions(blocks as OutlineBlock[])

  // Delete existing blocks, re-insert all
  await supabaseAdmin.from('outline_blocks').delete().eq('outline_id', outlineId)

  if (normalized.length > 0) {
    const toInsert = normalized.map(b => ({
      id: b.id.startsWith('local-') || b.id.startsWith('ai-') ? undefined : b.id,
      outline_id: outlineId,
      parent_id: b.parent_id,
      type: b.type,
      content: b.content,
      scripture_ref: b.scripture_ref ?? null,
      position: b.position,
      estimated_minutes: b.estimated_minutes ?? null,
      ai_source: b.ai_source ?? null,
      ai_edited: b.ai_edited,
      updated_at: now,
    }))

    const { error } = await supabaseAdmin.from('outline_blocks').insert(toInsert)
    if (error) return { error: error.message }
  }

  // Update outline updated_at
  await supabaseAdmin
    .from('outlines')
    .update({ updated_at: now })
    .eq('id', outlineId)

  return {}
}

// ── Create snapshot pair (manual labeled save) ─────────────────────────────────
export async function createManualSnapshotAction(
  sessionId: string,
  outlineId: string,
  churchId: string,
  label: string,
  blocks: OutlineBlock[]
): Promise<{ version?: number; error?: string }> {
  const user = await getAuthUser()

  try {
    const { data: session } = await supabaseAdmin
      .from('teaching_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('teacher_id', user.id)
      .single()

    if (!session) return { error: 'Session not found' }

    const { data: contentTags } = await supabaseAdmin
      .from('content_tags')
      .select('tag_id')
      .eq('session_id', sessionId)

    const snapshotData: SessionSnapshotData = {
      title: session.title,
      scripture_ref: session.scripture_ref,
      scripture_data: session.scripture_data,
      type: session.type,
      status: session.status,
      visibility: session.visibility,
      estimated_duration: session.estimated_duration,
      notes: session.notes,
      confirmed_tag_ids: contentTags?.map(t => t.tag_id) ?? [],
    }

    const version = await createSnapshotPair({
      sessionId,
      outlineId,
      churchId,
      createdBy: user.id,
      label: label.trim() || null,
      sessionData: snapshotData,
      blocks,
    })

    return { version }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Snapshot failed' }
  }
}

// ── Restore from snapshot ──────────────────────────────────────────────────────
export async function restoreSnapshotAction(
  sessionId: string,
  outlineId: string,
  churchId: string,
  churchSlug: string,
  versionNumber: number
): Promise<{ error?: string }> {
  const user = await getAuthUser()

  // Verify ownership
  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('teacher_id')
    .eq('id', sessionId)
    .single()

  if (session?.teacher_id !== user.id) return { error: 'Unauthorized' }

  // Fetch the target snapshot
  const { data: outlineSnap } = await supabaseAdmin
    .from('outline_snapshots')
    .select('blocks')
    .eq('session_id', sessionId)
    .eq('version_number', versionNumber)
    .single()

  const { data: sessionSnap } = await supabaseAdmin
    .from('session_snapshots')
    .select('data')
    .eq('session_id', sessionId)
    .eq('version_number', versionNumber)
    .single()

  if (!outlineSnap || !sessionSnap) return { error: 'Snapshot not found' }

  // 1. Auto-snapshot current state before restoring
  const currentData = await getSessionWithOutline(sessionId, user.id)
  if (currentData) {
    const snapData: SessionSnapshotData = {
      title: currentData.session.title,
      scripture_ref: currentData.session.scripture_ref,
      scripture_data: currentData.session.scripture_data,
      type: currentData.session.type,
      status: currentData.session.status,
      visibility: currentData.session.visibility,
      estimated_duration: currentData.session.estimated_duration,
      notes: currentData.session.notes,
      confirmed_tag_ids: [],
    }
    await createSnapshotPair({
      sessionId,
      outlineId,
      churchId,
      createdBy: user.id,
      label: `Auto-save before restore to v${versionNumber}`,
      sessionData: snapData,
      blocks: currentData.blocks,
    })
  }

  // 2. Restore session fields
  const snapData = sessionSnap.data as SessionSnapshotData
  await supabaseAdmin
    .from('teaching_sessions')
    .update({
      title: snapData.title,
      scripture_ref: snapData.scripture_ref,
      scripture_data: snapData.scripture_data,
      type: snapData.type,
      estimated_duration: snapData.estimated_duration,
      notes: snapData.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)

  // 3. Restore outline blocks
  await supabaseAdmin.from('outline_blocks').delete().eq('outline_id', outlineId)
  const restoredBlocks = outlineSnap.blocks as OutlineBlock[]
  if (restoredBlocks.length > 0) {
    await supabaseAdmin.from('outline_blocks').insert(
      restoredBlocks.map(b => ({
        outline_id: outlineId,
        parent_id: b.parent_id,
        type: b.type,
        content: b.content,
        scripture_ref: b.scripture_ref,
        position: b.position,
        estimated_minutes: b.estimated_minutes,
        ai_source: b.ai_source,
        ai_edited: b.ai_edited,
      }))
    )
  }

  revalidatePath(`/${churchSlug}/teaching/${sessionId}`)
  revalidatePath(`/${churchSlug}/teaching/${sessionId}/history`)
  return {}
}
