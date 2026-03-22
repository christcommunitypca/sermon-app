import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  TeachingSession,
  Outline,
  OutlineBlock,
  Flow,
  FlowStep,
  SelectedFlowSnapshot,
} from '@/types/database'

export async function getSessionWithOutline(sessionId: string, teacherId: string) {
  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('teacher_id', teacherId)
    .single()

  if (!session) return null

  const { data: outline } = await supabaseAdmin
    .from('outlines')
    .select('*')
    .eq('session_id', sessionId)
    .single()

  let blocks: OutlineBlock[] = []
  if (outline) {
    const { data } = await supabaseAdmin
      .from('outline_blocks')
      .select('*')
      .eq('outline_id', outline.id)
      .order('position')
    blocks = data ?? []
  }

  return { session: session as TeachingSession, outline: outline as Outline | null, blocks }
}

export async function getSessionsForTeacher(churchId: string, teacherId: string) {
  const { data } = await supabaseAdmin
    .from('teaching_sessions')
    .select('id, title, type, status, visibility, scripture_ref, estimated_duration, created_at, updated_at, published_at, delivered_at, selected_flow_id')
    .eq('church_id', churchId)
    .eq('teacher_id', teacherId)
    .order('updated_at', { ascending: false })

  return data ?? []
}

export async function getThoughtsForSession(sessionId: string) {
  const { data } = await supabaseAdmin
    .from('thought_captures')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })

  return data ?? []
}

export async function getTagsForSession(sessionId: string, churchId: string) {
  const { data: contentTags } = await supabaseAdmin
    .from('content_tags')
    .select('id, tag_id, is_ai_suggested, confirmed, tags(id, label, slug, taxonomy_id, tag_taxonomies(name, slug))')
    .eq('session_id', sessionId)
    .eq('church_id', churchId)

  return contentTags ?? []
}

export async function getAllTagsForChurch(churchId: string) {
  const { data } = await supabaseAdmin
    .from('tags')
    .select('*, tag_taxonomies(name, slug)')
    .eq('church_id', churchId)
    .order('label')

  return data ?? []
}

export async function getTaxonomiesForChurch(churchId: string) {
  const { data } = await supabaseAdmin
    .from('tag_taxonomies')
    .select('*')
    .eq('church_id', churchId)
    .order('name')

  return data ?? []
}

// Ensure an outline row exists for a session, creating it if needed
export async function ensureOutline(sessionId: string, churchId: string): Promise<Outline> {
  const { data: existing } = await supabaseAdmin
    .from('outlines')
    .select('*')
    .eq('session_id', sessionId)
    .single()

  if (existing) return existing as Outline

  const { data: created, error } = await supabaseAdmin
    .from('outlines')
    .insert({ session_id: sessionId, church_id: churchId })
    .select()
    .single()

  if (error || !created) throw new Error(`Failed to create outline: ${error?.message}`)
  return created as Outline
}

export function buildSelectedFlowSnapshot(flow: Flow): SelectedFlowSnapshot {
  return {
    id: flow.id,
    name: flow.name,
    description: flow.description ?? null,
    explanation: flow.explanation ?? null,
    steps: (flow.steps ?? []).map((step: FlowStep) => ({
      id: step.id,
      title: step.title,
      prompt_hint: step.prompt_hint ?? null,
      suggested_block_type: step.suggested_block_type ?? null,
    })),
  }
}

export async function getFlowForSession(args: {
  churchId: string
  teacherId: string
  session: TeachingSession
}): Promise<SelectedFlowSnapshot | null> {
  const { churchId, teacherId, session } = args

  if (session.selected_flow_snapshot) {
    return session.selected_flow_snapshot
  }

  if (session.selected_flow_id) {
    const { data: selectedFlow } = await supabaseAdmin
      .from('flows')
      .select('*')
      .eq('id', session.selected_flow_id)
      .eq('church_id', churchId)
      .eq('teacher_id', teacherId)
      .eq('is_archived', false)
      .single()

    if (selectedFlow) {
      return buildSelectedFlowSnapshot(selectedFlow as Flow)
    }
  }

  // Legacy fallback for sessions created before explicit flow selection existed
  const { data: flows } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('church_id', churchId)
    .eq('teacher_id', teacherId)
    .eq('is_archived', false)
    .eq('is_default_for', session.type)
    .limit(1)

  const fallback = flows?.[0] as Flow | undefined
  return fallback ? buildSelectedFlowSnapshot(fallback) : null
}