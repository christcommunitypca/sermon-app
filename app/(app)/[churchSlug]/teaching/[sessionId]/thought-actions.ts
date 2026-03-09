'use server'

import { getActionUser } from '@/lib/supabase/auth-context'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function addTextThoughtAction(
  sessionId: string,
  churchId: string,
  churchSlug: string,
  content: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  // Verify session ownership
  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('teacher_id')
    .eq('id', sessionId)
    .single()

  if (session?.teacher_id !== user.id) return { error: 'Unauthorized' }

  const { error } = await supabaseAdmin.from('thought_captures').insert({
    session_id: sessionId,
    church_id: churchId,
    type: 'text',
    content: content.trim(),
    transcription_status: 'none',
  })

  if (error) return { error: error.message }

  revalidatePath(`/${churchSlug}/teaching/${sessionId}/thoughts`)
  return {}
}

export async function addAudioThoughtAction(
  sessionId: string,
  churchId: string,
  storagePath: string,
  fileName: string,
  fileSizeBytes: number,
  durationSeconds: number | null
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('teacher_id')
    .eq('id', sessionId)
    .single()

  if (session?.teacher_id !== user.id) return { error: 'Unauthorized' }

  const { error } = await supabaseAdmin.from('thought_captures').insert({
    session_id: sessionId,
    church_id: churchId,
    type: 'audio',
    storage_path: storagePath,
    file_name: fileName,
    file_size_bytes: fileSizeBytes,
    duration_seconds: durationSeconds,
    transcription_status: 'none',
  })

  if (error) return { error: error.message }
  return {}
}

export async function deleteThoughtAction(
  thoughtId: string,
  sessionId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  // Verify via session ownership
  const { data: thought } = await supabaseAdmin
    .from('thought_captures')
    .select('session_id, storage_path, teaching_sessions(teacher_id)')
    .eq('id', thoughtId)
    .single()

  const teacherId = (thought?.teaching_sessions as any)?.teacher_id
  if (teacherId !== user.id) return { error: 'Unauthorized' }

  // Delete from storage if audio
  if (thought?.storage_path) {
    const supabase = await createClient()
    await supabase.storage.from('thought-captures').remove([thought.storage_path])
  }

  await supabaseAdmin.from('thought_captures').delete().eq('id', thoughtId)

  revalidatePath(`/${churchSlug}/teaching/${sessionId}/thoughts`)
  return {}
}
