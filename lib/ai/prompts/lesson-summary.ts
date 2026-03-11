// ── lib/ai/prompts/lesson-summary.ts ──────────────────────────────────────────
// Builds the prompt for the lesson summary — delivery time estimate, key theme,
// and 10 sermon title suggestions.

import type { PromptPayload } from '@/lib/ai/types'
import type { LessonSummaryInput } from '@/lib/ai/types'

export const VERSION = 'v1.0'

export function buildPrompt(input: LessonSummaryInput): PromptPayload {
  const { outlineText, scriptureRef, tradition, targetMinutes } = input

  const system = `You are a preaching coach helping a pastor finalize a sermon. \
Return ONLY a JSON object — no markdown, no explanation.

Response shape:
{
  "estimated_minutes": <number>,
  "key_theme": "<1-2 sentences>",
  "titles": ["title 1", "title 2", ..., "title 10"]
}

Rules for estimated_minutes:
- Assume ~130 words per minute average speaking pace for expository preaching.
- Count the substantive content words in the outline (not labels like "Point", "Application").
- Add 10% for natural pauses, scripture reading, and transitions.
- Return a whole number.

Rules for key_theme:
- One theological statement that captures the central claim of this passage and outline.
- Precise and specific to this text — not a generic truism.

Rules for titles:
- Exactly 10 titles.
- Each must be attention-grabbing, biblically faithful, and consistent with ${tradition} theology.
- Vary the style across the 10: include questions, declarative statements, paradoxes, 
  image-based titles, command-form titles. Never repeat a style more than twice.
- Avoid clichés, jargon, and vague spiritual language.
- Length: 4-10 words. No subtitles.`

  const user = `Scripture: ${scriptureRef ?? 'Not specified'}
Theological tradition: ${tradition}
Target delivery time: ${targetMinutes ? `${targetMinutes} minutes` : 'not specified'}

Outline:
${outlineText}

Return the JSON object only.`

  return { system, user, version: VERSION, temperature: 0.5 }
}

// ── buildCopyablePrompt ────────────────────────────────────────────────────────
// Returns a human-readable prompt string the teacher can paste into any AI tool.
export function buildCopyablePrompt(input: LessonSummaryInput): string {
  const { outlineText, scriptureRef, tradition, targetMinutes } = input

  return `Below is a preaching outline. Please provide:

1. An estimated delivery time in minutes (assume ~130 words/min average speaking pace for expository preaching; add ~10% for pauses and scripture reading)
2. The single key theological theme of this passage and outline, in 1-2 sentences — specific to this text, not a generic truism
3. Ten sermon titles that are:
   - Attention-grabbing and memorable
   - Biblically faithful and theologically precise
   - Consistent with ${tradition} theology
   - Varied in style: mix questions, declarative statements, paradoxes, image-based titles, command-form titles
   - 4-10 words each, no subtitles, no clichés

Scripture: ${scriptureRef ?? 'Not specified'}
Theological tradition: ${tradition}
Target duration: ${targetMinutes ? `${targetMinutes} minutes` : 'not specified'}

Outline:
${outlineText}`
}
