import { NextRequest, NextResponse } from 'next/server'
import { generateOutline } from '@/lib/ai/service'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { OutlineSelectedFlow } from '@/lib/outlinePrompt'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      teacherId,
      sessionId,
      churchId,
      selectedFlow,
      flowStructure,
      verseNotes,
      selectedInsights,
    } = body as {
      teacherId?: string
      sessionId?: string
      churchId?: string
      selectedFlow?: OutlineSelectedFlow | null
      flowStructure?: { type?: string; label?: string }[] | null
      verseNotes?: Record<string, string>
      selectedInsights?: { verseRef: string; category: string; title: string; content: string }[]
    }

    if (!teacherId || !sessionId || !churchId) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    const { data: session } = await supabaseAdmin
      .from('teaching_sessions')
      .select('title, type, scripture_ref, notes, estimated_duration')
      .eq('id', sessionId)
      .eq('teacher_id', teacherId)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
    }

    const { data: outline } = await supabaseAdmin
      .from('outlines')
      .select('id')
      .eq('session_id', sessionId)
      .single()

    if (!outline) {
      return NextResponse.json({ error: 'Outline not found.' }, { status: 404 })
    }

    const { data: thoughts } = await supabaseAdmin
      .from('thought_captures')
      .select('content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })

    const normalizedSelectedFlow: OutlineSelectedFlow | null =
      selectedFlow ??
      (flowStructure?.length
        ? {
            name: 'Selected Flow',
            description: null,
            explanation: null,
            steps: flowStructure.map((block, index) => ({
              id: String(index),
              title: block.label ?? `Step ${index + 1}`,
              promptHint: null,
              suggestedBlockType: block.type ?? 'point',
            })),
          }
        : null)

    const result = await generateOutline(teacherId, {
      session: {
        title: session.title,
        type: session.type,
        scriptureRef: session.scripture_ref,
        notes: session.notes,
        estimatedDuration: session.estimated_duration,
      },
      thoughts: (thoughts ?? []).map(t => ({ content: t.content ?? '' })),
      selectedFlow: normalizedSelectedFlow,
      outlineId: outline.id,
      verseNotes,
      selectedInsights,
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate outline.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}