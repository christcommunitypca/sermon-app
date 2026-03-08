import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateSeriesPlan } from '@/lib/ai/series'
import { getUserTradition } from '@/lib/research'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, scriptureSection, totalWeeks, startDate, description } = body

  if (!title || !scriptureSection || !totalWeeks) {
    return NextResponse.json({ error: 'title, scriptureSection, and totalWeeks are required' }, { status: 400 })
  }

  const tradition = await getUserTradition(user.id)

  const result = await generateSeriesPlan(user.id, {
    title,
    scriptureSection,
    totalWeeks: parseInt(totalWeeks),
    startDate: startDate ?? null,
    tradition,
    description,
  })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ weeks: result.weeks, model: result.model })
}
