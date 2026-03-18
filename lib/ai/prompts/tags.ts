// ── lib/ai/prompts/tags.ts ────────────────────────────────────────────────────
// Builds the prompt payload for tag suggestion.

import type { PromptPayload } from '@/lib/ai/types'
import type { TagInput } from '@/lib/ai/types'

export const VERSION = 'v1.0'

export function buildPrompt(input: TagInput): PromptPayload {
  const existingNote = input.existingTags.length
    ? `Already tagged with: ${input.existingTags.join(', ')}. Do not repeat these.`
    : 'No existing tags.'

  const system = `You are a sermon taxonomy assistant. Return ONLY a JSON array of tag strings. No markdown, no explanation.
Rules:
- Return 3–6 short, lowercase tag labels (1–3 words each)
- Tags should reflect: scripture themes, doctrinal topics, application areas, or series themes
- Avoid generic tags like "sermon" or "teaching"
- Avoid tags that duplicate the passage reference
- ${existingNote}`

  const user = `Session title: "${input.sessionTitle}"
Type: ${input.sessionType}
${input.scriptureRef ? `Scripture: ${input.scriptureRef}` : ''}
${input.outlineContent ? `\nOutline content:\n${input.outlineContent}` : ''}

Suggest relevant tags for this teaching session.`

  return { system, user, version: VERSION, temperature: 0.3, maxTokens: 300 }
}
