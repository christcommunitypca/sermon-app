import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateOutline } from '@/lib/ai/generate'
import { getSessionWithOutline, getThoughtsForSession, ensureOutline } from '@/lib/teaching'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, churchId, flowStructure } = await req.json()

  if (!sessionId || !churchId) {
    return NextResponse.json({ error: 'sessionId and churchId required' }, { status: 400 })
  }

  const data = await getSessionWithOutline(sessionId, user.id)
  if (!data) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const outline = data.outline ?? await ensureOutline(sessionId, churchId)
  const thoughts = await getThoughtsForSession(sessionId)

  const result = await generateOutline(user.id, {
    session: data.session,
    thoughts,
    flowStructure,
    outlineId: outline.id,
  })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ blocks: result.blocks, model: result.model })
}
