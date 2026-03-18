import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateOutline, AIError } from '@/lib/ai/service'
import { getSessionWithOutline, getThoughtsForSession, ensureOutline } from '@/lib/teaching'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { session: authSession } } = await supabase.auth.getSession()
  const user = authSession?.user ?? null
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, churchId, flowStructure } = await req.json()

  if (!sessionId || !churchId) {
    return NextResponse.json({ error: 'sessionId and churchId required' }, { status: 400 })
  }

  const data = await getSessionWithOutline(sessionId, user.id)
  if (!data) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const outline = data.outline ?? await ensureOutline(sessionId, churchId)
  const thoughts = await getThoughtsForSession(sessionId)

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
      flowStructure,
      outlineId: outline.id,
    })

    return NextResponse.json({ blocks: result.blocks, model: result.model })
  } catch (err) {
    if (err instanceof AIError) {
      const status = err.code === 'key_missing' || err.code === 'key_invalid' ? 403 : 400
      return NextResponse.json({ error: err.message }, { status })
    }
    throw err
  }
}
