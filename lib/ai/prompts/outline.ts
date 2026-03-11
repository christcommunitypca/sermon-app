// ── lib/ai/prompts/outline.ts ─────────────────────────────────────────────────
// Builds the prompt payload for outline generation.
// No imports from providers or service — pure prompt construction.

import type { PromptPayload } from '@/lib/ai/types'
import type { OutlineInput } from '@/lib/ai/types'

export const VERSION = 'v1.0'

export function buildPrompt(input: OutlineInput): PromptPayload {
  const { session, thoughts, flowStructure } = input

  const thoughtText = thoughts
    .filter(t => t.content?.trim())
    .map(t => `- ${t.content}`)
    .join('\n') || 'None provided.'

  const flowHint = flowStructure?.length
    ? `Structure your outline using these sections in order: ${flowStructure.map(f => f.label).join(', ')}.`
    : 'Use a standard sermon structure: Introduction, Main Points, Application, Conclusion.'

  const durationRule = session.estimatedDuration
    ? `- CRITICAL: The total of all estimated_minutes values MUST sum to approximately ${session.estimatedDuration} minutes. Fit the outline to this target. Do not ignore this constraint.`
    : ''

  const durationUser = session.estimatedDuration
    ? `Target delivery time: ${session.estimatedDuration} minutes — the outline MUST fit this time`
    : 'Target delivery time: not specified'

  const system = `You are a sermon outline assistant for pastors. Generate a structured outline in JSON format.

Rules:
- Return ONLY a JSON array of blocks, no markdown, no explanation.
- Each block: { type, content, parent_index, estimated_minutes, confidence }
  - type: "point" | "sub_point" | "scripture" | "illustration" | "application" | "transition"
  - content: concise outline text, not a manuscript
  - parent_index: null for top-level blocks, or the 0-based index of the parent in this array
  - estimated_minutes: number or null
  - confidence: "high" | "medium" | "low"
    - high = clear scriptural direction
    - medium = reasonable interpretation
    - low = suggestion needing pastor review
- ${flowHint}
${durationRule}`

  // Build verse notes section if provided
  const verseNotesText = input.verseNotes
    ? Object.entries(input.verseNotes)
        .filter(([, note]) => note.trim())
        .map(([ref, note]) => `[${ref}] ${note}`)
        .join('\n')
    : ''

  // Build selected insights section if provided
  const selectedInsightsText = input.selectedInsights?.length
    ? input.selectedInsights
        .map(i => `[${i.verseRef} / ${i.category}] ${i.title ? i.title + ': ' : ''}${i.content}`)
        .join('\n')
    : ''

  const user = `Create a preaching outline for:

Title: ${session.title}
Type: ${session.type}
Scripture: ${session.scriptureRef ?? 'Not specified'}
${durationUser}
Notes: ${session.notes ?? 'None'}

Thought captures / raw ideas from the pastor:
${thoughtText}${verseNotesText ? `

Pastor's verse-by-verse study notes:
${verseNotesText}` : ''}${selectedInsightsText ? `

Research insights the pastor has selected to incorporate:
${selectedInsightsText}` : ''}

Return a JSON array of outline blocks only.`

  return { system, user, version: VERSION, temperature: 0.4 }
}