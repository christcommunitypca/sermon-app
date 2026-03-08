import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { decryptKey } from '@/lib/ai/key'
import { SeriesSession, ProposedWeek } from '@/types/database'
import { matchObservancesToWeeks, formatObservancesForPrompt, traditionDisplayName } from '@/lib/liturgical'

export const SERIES_PROMPT_VERSION = 'v1.0'

// ProposedWeek type lives in types/database.ts (shared client/server)
export type { ProposedWeek } from '@/types/database'

interface SeriesGenerateResult {
  weeks: ProposedWeek[]
  model: string
  error?: string
}

export async function generateSeriesPlan(
  userId: string,
  params: {
    title: string
    scriptureSection: string
    totalWeeks: number
    startDate: string | null
    tradition: string
    description?: string | null
  }
): Promise<SeriesGenerateResult> {
  const { data: keyRow } = await supabaseAdmin
    .from('user_ai_keys')
    .select('openai_key_enc, model_preference, validation_status')
    .eq('user_id', userId)
    .single()

  if (!keyRow || keyRow.validation_status !== 'valid' || !keyRow.openai_key_enc) {
    return { weeks: [], model: '', error: 'No valid AI key. Add one in Settings → AI.' }
  }

  let plainKey: string
  try {
    plainKey = await decryptKey(keyRow.openai_key_enc)
  } catch {
    return { weeks: [], model: '', error: 'Failed to decrypt AI key.' }
  }

  const model = keyRow.model_preference ?? 'gpt-4o'
  const tradName = traditionDisplayName(params.tradition)

  // Build liturgical context if start date provided
  let liturgicalContext = 'No start date provided — omit liturgical notes.'
  if (params.startDate) {
    const start = new Date(params.startDate)
    const observances = matchObservancesToWeeks(start, params.totalWeeks, params.tradition)
    liturgicalContext = formatObservancesForPrompt(observances)
  }

  const system = `You are a preaching planner helping a pastor develop a teaching series. 
Return ONLY a JSON array of week objects. No markdown, no explanation.
Each: { week_number, proposed_title, proposed_scripture, notes, liturgical_note }
- week_number: 1-based integer
- proposed_title: sermon/lesson title for this week
- proposed_scripture: specific passage for this week (e.g. "Romans 1:1-7")
- notes: 2-3 sentences of preparation notes and thematic focus
- liturgical_note: brief note if a liturgical observance affects this week, otherwise null
The progression should flow naturally through the scripture section, with a logical arc.
Honor the theological tradition in how passages are approached and themes are developed.`

  const userMsg = `Series title: "${params.title}"
Scripture section: ${params.scriptureSection}
Number of weeks: ${params.totalWeeks}
Tradition: ${tradName}
${params.description ? `Description: ${params.description}` : ''}

Liturgical calendar for this series window:
${liturgicalContext}

Plan a ${params.totalWeeks}-week series through ${params.scriptureSection}.`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${plainKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { weeks: [], model, error: body?.error?.message ?? `OpenAI error ${res.status}` }
    }

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? ''
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed: ProposedWeek[] = JSON.parse(cleaned)

    if (!Array.isArray(parsed)) throw new Error('Expected array')

    return { weeks: parsed, model }
  } catch (err) {
    return {
      weeks: [],
      model,
      error: err instanceof Error ? err.message : 'Failed to parse AI response',
    }
  }
}
