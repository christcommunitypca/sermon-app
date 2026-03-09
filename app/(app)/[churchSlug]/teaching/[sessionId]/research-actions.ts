'use server'

import { getActionUser } from '@/lib/supabase/auth-context'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { BlockType } from '@/types/database'

export async function pinResearchItemAction(
  itemId: string,
  isPinned: boolean
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { error } = await supabaseAdmin
    .from('research_items')
    .update({ is_pinned: isPinned })
    .eq('id', itemId)
    .eq('teacher_id', user.id)

  if (error) return { error: error.message }
  return {}
}

export async function dismissResearchItemAction(
  itemId: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { error } = await supabaseAdmin
    .from('research_items')
    .update({ is_dismissed: true })
    .eq('id', itemId)
    .eq('teacher_id', user.id)

  if (error) return { error: error.message }
  return {}
}

// Append a research item as a block to the session's outline
export async function pushResearchToOutlineAction(
  sessionId: string,
  churchId: string,
  churchSlug: string,
  content: string,
  blockType: BlockType
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

  // Get or create outline
  let { data: outline } = await supabaseAdmin
    .from('outlines')
    .select('id')
    .eq('session_id', sessionId)
    .single()

  if (!outline) {
    const { data: created } = await supabaseAdmin
      .from('outlines')
      .insert({ session_id: sessionId, church_id: churchId })
      .select()
      .single()
    outline = created
  }

  if (!outline) return { error: 'Could not find or create outline' }

  // Get max position at top level
  const { data: existing } = await supabaseAdmin
    .from('outline_blocks')
    .select('position')
    .eq('outline_id', outline.id)
    .is('parent_id', null)
    .order('position', { ascending: false })
    .limit(1)

  const maxPos = existing?.[0]?.position ?? -1

  const { error } = await supabaseAdmin
    .from('outline_blocks')
    .insert({
      outline_id: outline.id,
      parent_id: null,
      type: blockType,
      content,
      position: maxPos + 1,
      ai_source: null,
      ai_edited: false,
    })

  if (error) return { error: error.message }
  return {}
}

// Update tradition setting
export async function updateTraditionAction(
  userId: string,
  tradition: string
): Promise<{ error?: string }> {
  await getActionUser()

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ theological_tradition: tradition, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) return { error: error.message }
  return {}
}
