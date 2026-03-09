// ── lib/ai/prompts/series.ts ──────────────────────────────────────────────────
// Builds the prompt payload for series plan generation.

import type { PromptPayload } from '@/lib/ai/types'
import type { SeriesInput } from '@/lib/ai/types'
import { traditionDisplayName } from '@/lib/liturgical'

export const VERSION = 'v1.0'

export function buildPrompt(input: SeriesInput): PromptPayload {
  const tradName = traditionDisplayName(input.tradition)

  const system = `You are a preaching planner helping a pastor develop a teaching series.
Return ONLY a JSON array of week objects. No markdown, no explanation.
Each: { week_number, proposed_title, proposed_scripture, notes, liturgical_note }
- week_number: 1-based integer
- proposed_title: sermon/lesson title for this week
- proposed_scripture: specific passage for this week (e.g. "Romans 1:1-7")
- notes: 2–3 sentences of preparation notes and thematic focus for this week
- liturgical_note: brief note if a liturgical observance affects this week, otherwise null
The progression should flow naturally through the scripture section with a logical arc.
Honor the theological tradition in how passages are approached and themes developed.`

  const user = `Series title: "${input.title}"
Scripture section: ${input.scriptureSection}
Number of weeks: ${input.totalWeeks}
Tradition: ${tradName}
${input.description ? `Description: ${input.description}` : ''}

Liturgical calendar for this series window:
${input.liturgicalContext}

Plan a ${input.totalWeeks}-week series through ${input.scriptureSection}.`

  return { system, user, version: VERSION, temperature: 0.4, maxTokens: 3000 }
}
