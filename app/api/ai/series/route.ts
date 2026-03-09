import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateSeries, AIError } from '@/lib/ai/service'
import { getUserTradition } from '@/lib/research'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, scriptureSection, totalWeeks, startDate, description } = await req.json()

  if (!title || !scriptureSection || !totalWeeks) {
    return NextResponse.json({ error: 'title, scriptureSection, and totalWeeks are required' }, { status: 400 })
  }

  const tradition = await getUserTradition(user.id)

  try {
    const result = await generateSeries(user.id, {
      title,
      scriptureSection,
      totalWeeks: parseInt(totalWeeks),
      startDate: startDate ?? null,
      tradition,
      description: description ?? null,
    })

    return NextResponse.json({ weeks: result.weeks, model: result.model })
  } catch (err) {
    if (err instanceof AIError) {
      const status = err.code === 'key_missing' || err.code === 'key_invalid' ? 403 : 400
      return NextResponse.json({ error: err.message }, { status })
    }
    throw err
  }
}
