import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateResearchCategory } from '@/lib/ai/research'
import { saveResearchItems, getUserTradition } from '@/lib/research'
import { ResearchCategory } from '@/types/database'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, churchId, category, replaceExisting } = await req.json()

  if (!sessionId || !churchId || !category) {
    return NextResponse.json({ error: 'sessionId, churchId, and category are required' }, { status: 400 })
  }

  // Fetch session to build context
  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('title, type, scripture_ref, notes')
    .eq('id', sessionId)
    .eq('teacher_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  if (!session.scripture_ref) {
    return NextResponse.json({ error: 'Session must have a scripture reference for research.' }, { status: 400 })
  }

  const tradition = await getUserTradition(user.id)

  const ctx = {
    scriptureRef: session.scripture_ref,
    sessionTitle: session.title,
    sessionType: session.type,
    sessionNotes: session.notes,
    tradition,
  }

  // If replaceExisting, delete old items for this category first
  if (replaceExisting) {
    await supabaseAdmin
      .from('research_items')
      .delete()
      .eq('session_id', sessionId)
      .eq('category', category)
  }

  const result = await generateResearchCategory(user.id, category as ResearchCategory, ctx)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  if (!result.items.length) {
    return NextResponse.json({ items: [], model: result.model })
  }

  const saved = await saveResearchItems(sessionId, churchId, user.id, category, result.items)

  return NextResponse.json({ items: saved, model: result.model })
}
