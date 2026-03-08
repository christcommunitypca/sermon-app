import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { decryptKey } from '@/lib/ai/key'
import { OutlineBlock, TeachingSession, ThoughtCapture } from '@/types/database'
import { createLocalBlock } from '@/lib/outline'

export const PROMPT_VERSION = 'v1.0'

interface GenerateParams {
  session: TeachingSession
  thoughts: ThoughtCapture[]
  flowStructure?: { type: string; label: string }[]
  outlineId: string
}

interface GenerateResult {
  blocks: OutlineBlock[]
  model: string
  error?: string
}

export async function generateOutline(
  userId: string,
  params: GenerateParams
): Promise<GenerateResult> {
  // Get and decrypt the user's API key
  const { data: keyRow } = await supabaseAdmin
    .from('user_ai_keys')
    .select('openai_key_enc, model_preference, validation_status')
    .eq('user_id', userId)
    .single()

  if (!keyRow || keyRow.validation_status !== 'valid' || !keyRow.openai_key_enc) {
    return { blocks: [], model: '', error: 'No valid AI key. Add one in Settings → AI.' }
  }

  let plainKey: string
  try {
    plainKey = await decryptKey(keyRow.openai_key_enc)
  } catch {
    return { blocks: [], model: '', error: 'Failed to decrypt AI key.' }
  }

  const model = keyRow.model_preference ?? 'gpt-4o'
  const { session, thoughts, flowStructure, outlineId } = params

  // Build context
  const thoughtText = thoughts
    .filter(t => t.type === 'text' && t.content)
    .map(t => `- ${t.content}`)
    .join('\n') || 'None provided.'

  const flowHint = flowStructure?.length
    ? `Structure your outline using these sections in order: ${flowStructure.map(f => f.label).join(', ')}.`
    : 'Use a standard sermon structure: Introduction, Main Points, Application, Conclusion.'

  const systemPrompt = `You are a sermon outline assistant for pastors. Generate a structured outline in JSON format.

Rules:
- Return ONLY a JSON array of blocks, no markdown, no explanation.
- Each block has: type, content, parent_index (null for top-level, or the 0-based index of the parent block in your output array), estimated_minutes (number or null), confidence ("high"|"medium"|"low")
- Block types: point, sub_point, scripture, illustration, application, transition
- Keep content concise — outlines, not manuscripts.
- Assign confidence: "high" for clear scriptural direction, "medium" for reasonable interpretation, "low" for suggestions needing pastor review.
- ${flowHint}`

  const userPrompt = `Create a preaching outline for:

Title: ${session.title}
Type: ${session.type}
Scripture: ${session.scripture_ref ?? 'Not specified'}
Estimated duration: ${session.estimated_duration ? `${session.estimated_duration} minutes` : 'Not specified'}
Notes: ${session.notes ?? 'None'}

Thought captures / raw ideas from the pastor:
${thoughtText}

Return a JSON array of outline blocks only.`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${plainKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { blocks: [], model, error: body?.error?.message ?? `OpenAI error ${res.status}` }
    }

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? ''

    // Parse JSON — strip any accidental markdown fences
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed: Array<{
      type: string
      content: string
      parent_index: number | null
      estimated_minutes: number | null
      confidence: 'high' | 'medium' | 'low'
    }> = JSON.parse(cleaned)

    if (!Array.isArray(parsed)) throw new Error('Expected array')

    // Build OutlineBlock objects with parent_id references
    const tempIds: string[] = parsed.map((_, i) => `ai-${i}-${Date.now()}`)

    const blocks: OutlineBlock[] = parsed.map((item, i) => ({
      ...createLocalBlock(
        outlineId,
        item.parent_index !== null && item.parent_index !== undefined
          ? tempIds[item.parent_index]
          : null,
        (item.type as OutlineBlock['type']) ?? 'point',
        i
      ),
      id: tempIds[i],
      content: item.content ?? '',
      estimated_minutes: item.estimated_minutes ?? null,
      ai_source: {
        model,
        prompt_version: PROMPT_VERSION,
        confidence: item.confidence ?? 'medium',
      },
      ai_edited: false,
    }))

    return { blocks, model }
  } catch (err) {
    return {
      blocks: [],
      model,
      error: err instanceof Error ? err.message : 'Failed to parse AI response',
    }
  }
}
