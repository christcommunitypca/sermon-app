'use server'

import { getActionUser } from '@/lib/supabase/auth-context'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function addTagToSessionAction(
  sessionId: string,
  churchId: string,
  tagId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('teacher_id')
    .eq('id', sessionId)
    .single()

  if (session?.teacher_id !== user.id) return { error: 'Unauthorized' }

  const { error } = await supabaseAdmin.from('content_tags').insert({
    session_id: sessionId,
    church_id: churchId,
    tag_id: tagId,
    is_ai_suggested: false,
    confirmed: true,
  })

  if (error && error.code !== '23505') return { error: error.message } // ignore duplicate

  revalidatePath(`/${churchSlug}/teaching/${sessionId}/tags`)
  return {}
}

export async function removeTagFromSessionAction(
  contentTagId: string,
  sessionId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { data: ct } = await supabaseAdmin
    .from('content_tags')
    .select('session_id, teaching_sessions(teacher_id)')
    .eq('id', contentTagId)
    .single()

  const teacherId = (ct?.teaching_sessions as any)?.teacher_id
  if (teacherId !== user.id) return { error: 'Unauthorized' }

  await supabaseAdmin.from('content_tags').delete().eq('id', contentTagId)

  revalidatePath(`/${churchSlug}/teaching/${sessionId}/tags`)
  return {}
}

export async function createTagAction(
  churchId: string,
  taxonomyId: string,
  label: string,
  churchSlug: string
): Promise<{ tagId?: string; error?: string }> {
  await getActionUser()

  const slug = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  const { data, error } = await supabaseAdmin
    .from('tags')
    .insert({ church_id: churchId, taxonomy_id: taxonomyId, label: label.trim(), slug })
    .select()
    .single()

  if (error) return { error: error.message }
  return { tagId: data.id }
}
