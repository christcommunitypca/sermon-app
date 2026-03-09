'use server'

import { getActionUser } from '@/lib/supabase/auth-context'
import { generateSeries, generateOutline, generateResearch, AIError } from '@/lib/ai/service'
import { getUserTradition } from '@/lib/research'
import { getSessionWithOutline, getThoughtsForSession, ensureOutline } from '@/lib/teaching'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { saveResearchItems } from '@/lib/research'
import type { ResearchCategory } from '@/types/database'

// ── Generate series plan ────────────────────────────────────────────────────
export async function generateSeriesAction(input: {
  title: string
  scriptureSection: string
  totalWeeks: number
  startDate: string | null
  description: string | null
}) {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' } as any
  const tradition = await getUserTradition(user.id)

  try {
    const result = await generateSeries(user.id, { ...input, tradition })
    return { weeks: result.weeks, model: result.model, error: null }
  } catch (err) {
    if (err instanceof AIError) return { weeks: null, model: null, error: err.message }
    throw err
  }
}

// ── Generate outline ────────────────────────────────────────────────────────
export async function generateOutlineAction(input: {
  sessionId: string
  churchId: string
  flowStructure: { type: string; label: string }[] | undefined
}) {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' } as any

  const data = await getSessionWithOutline(input.sessionId, user.id)
  if (!data) return { blocks: null, model: null, error: 'Session not found' }

  const outline = data.outline ?? await ensureOutline(input.sessionId, input.churchId)
  const thoughts = await getThoughtsForSession(input.sessionId)

  try {
    const result = await generateOutline(user.id, {
      session: {
        title: data.session.title,
        type: data.session.type,
        scriptureRef: data.session.scripture_ref,
        notes: data.session.notes,
        estimatedDuration: data.session.estimated_duration,
      },
      thoughts: thoughts.map(t => ({ content: t.content ?? '' })),
      flowStructure: input.flowStructure,
      outlineId: outline.id,
    })
    return { blocks: result.blocks, model: result.model, error: null }
  } catch (err) {
    if (err instanceof AIError) return { blocks: null, model: null, error: err.message }
    throw err
  }
}

// ── Generate research ───────────────────────────────────────────────────────
export async function generateResearchAction(input: {
  sessionId: string
  churchId: string
  category: ResearchCategory
  replaceExisting: boolean
}) {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' } as any

  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('title, type, scripture_ref, notes')
    .eq('id', input.sessionId)
    .eq('teacher_id', user.id)
    .single()

  if (!session) return { items: null, model: null, error: 'Session not found' }
  if (!session.scripture_ref) return { items: null, model: null, error: 'Session must have a scripture reference for research.' }

  if (input.replaceExisting) {
    await supabaseAdmin
      .from('research_items')
      .delete()
      .eq('session_id', input.sessionId)
      .eq('category', input.category)
  }

  const tradition = await getUserTradition(user.id)

  try {
    const result = await generateResearch(user.id, {
      scriptureRef: session.scripture_ref,
      sessionTitle: session.title,
      sessionType: session.type,
      sessionNotes: session.notes,
      tradition,
      category: input.category,
    })

    if (!result.items.length) return { items: [], model: result.model, error: null }

    const saved = await saveResearchItems(input.sessionId, input.churchId, user.id, input.category, result.items)
    return { items: saved, model: result.model, error: null }
  } catch (err) {
    if (err instanceof AIError) return { items: null, model: null, error: err.message }
    throw err
  }
}
