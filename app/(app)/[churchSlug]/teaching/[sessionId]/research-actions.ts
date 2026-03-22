'use server'

import { getActionUser } from '@/lib/supabase/auth-context'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { BlockType } from '@/types/database'
import {
  dismissUnifiedStudyItem,
  incrementUnifiedStudyItemUsedCount,
  setUnifiedStudyItemPinned,
} from '@/lib/study-content'

export async function pinResearchItemAction(args: {
  sessionId: string
  verseRef: string
  category: string
  itemIndex: number
  isPinned: boolean
  sourceResearchId?: string | null
}): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  try {
    await setUnifiedStudyItemPinned({
      sessionId: args.sessionId,
      teacherId: user.id,
      verseRef: args.verseRef,
      category: args.category,
      itemIndex: args.itemIndex,
      isPinned: args.isPinned,
      sourceResearchId: args.sourceResearchId,
    })
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to update item.' }
  }
}

export async function dismissResearchItemAction(args: {
  sessionId: string
  verseRef: string
  category: string
  itemIndex: number
  sourceResearchId?: string | null
}): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  try {
    await dismissUnifiedStudyItem({
      sessionId: args.sessionId,
      teacherId: user.id,
      verseRef: args.verseRef,
      category: args.category,
      itemIndex: args.itemIndex,
      sourceResearchId: args.sourceResearchId,
    })
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to dismiss item.' }
  }
}

// Append a research item as a block to the session's outline
export async function pushResearchToOutlineAction(args: {
  sessionId: string
  churchId: string
  churchSlug: string
  content: string
  blockType: BlockType
  verseRef?: string
  category?: string
  itemIndex?: number
  sourceResearchId?: string | null
}): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { sessionId, churchId, content, blockType } = args

  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('teacher_id')
    .eq('id', sessionId)
    .single()

  if (session?.teacher_id !== user.id) return { error: 'Unauthorized' }

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

  if (args.verseRef && args.category && typeof args.itemIndex === 'number') {
    try {
      await incrementUnifiedStudyItemUsedCount({
        sessionId: args.sessionId,
        teacherId: user.id,
        verseRef: args.verseRef,
        category: args.category,
        itemIndex: args.itemIndex,
        sourceResearchId: args.sourceResearchId,
      })
    } catch {}
  }

  return {}
}

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
