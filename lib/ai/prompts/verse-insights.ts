// ── lib/ai/prompts/verse-insights.ts ──────────────────────────────────────────
// Batched prompts for verse-by-verse insight generation.
//
// Strategy: 2 calls of 3 categories each, run in parallel.
// This keeps each response well under the 8192-token output ceiling even for
// long passages (20+ verses), while halving API call overhead vs 6 separate calls.
//
// Content limits per item: title + 2 sentences max. MAX 3 items per verse.
// This is intentional — high-value, concise insights beat padded content.
// Cost target: ~$0.04 for a 9-verse passage on Sonnet.

import type { PromptPayload } from '@/lib/ai/types'
import type { VerseInsightInput } from '@/lib/ai/types'

export const VERSION = 'v1.2'

export const CATEGORIES = [
  'word_study',
  'cross_refs',
  'practical',
  'theology_by_tradition',
  'context',
  'application',
] as const

export type InsightCategory = typeof CATEGORIES[number]

// Two batches — each covers 3 categories, run in parallel
export const CATEGORY_BATCHES: InsightCategory[][] = [
  ['word_study', 'cross_refs', 'context'],
  ['practical', 'theology_by_tradition', 'application'],
]

const CATEGORY_DESCRIPTIONS: Record<InsightCategory, string> = {
  word_study:
    'Key Greek (NT) or Hebrew (OT) words. Transliteration + why this word matters. Only flag words that are genuinely significant.',
  cross_refs:
    'Related Bible verses — just the reference (e.g. "Rom 5:1") and a single phrase on why it connects. No quotes, no explanation paragraphs. Prefer less-obvious connections over the standard ones.',
  practical:
    'A concrete analogy or illustration accessible to all ages. One clear image, theologically precise.',
  theology_by_tradition:
    'Where traditions meaningfully diverge on this verse. Only include traditions with a real stake here.',
  context:
    'One historical or cultural fact that would surprise most readers and directly illuminates meaning.',
  application:
    'One specific, concrete application grounded in the passage\'s own logic — not generic.',
}

// Build a prompt for one batch of 3 categories across all verses.
export function buildBatchPrompt(
  input: VerseInsightInput,
  categories: InsightCategory[]
): PromptPayload {
  const { verses, sessionTitle, sessionType, tradition } = input

  const passageText = verses
    .map(v => {
      const notes = input.pastorNotes?.[v.verse_ref]
      const notesLine = notes?.length
        ? `\n  Pastor notes: ${notes.join(' | ')}`
        : ''
      return `[${v.verse_ref}] ${v.text}${notesLine}`
    })
    .join('\n')

  const categorySpec = categories.map(cat =>
    `"${cat}": ${CATEGORY_DESCRIPTIONS[cat]}`
  ).join('\n')

  const verseRefs = verses.map(v => v.verse_ref).join(', ')

  const system = `You are a biblical studies assistant helping a pastor prepare to teach.

Generate insights for the categories: ${categories.join(', ')}.

Response — a JSON array, no markdown, no preamble:
[
  {
    "verse_ref": "Book Chapter:Verse",
    "category": "category_name",
    "items": [
      { "title": "Short label", "content": "1-2 sentences max" }
    ]
  }
]

Rules:
- Return ONLY the JSON array.
- One object per verse per category (${verses.length} verses × ${categories.length} categories = ${verses.length * categories.length} objects total).
- Verses: ${verseRefs}
- Categories and what they mean:
${categorySpec}
- items: MAX 3 per object. 1-2 sentences per item. Concise and specific.
- Cross-verse reasoning encouraged — insights may reference other verses in the passage.
- Teacher's tradition: ${tradition}. Weight application and theology_by_tradition accordingly.`

  const user = `Passage: ${sessionTitle} (${sessionType})

${passageText}

Generate ${categories.join(' + ')} insights. Return JSON array only.`

  return { system, user, version: VERSION, temperature: 0.3 }
}

// Keep for backwards compatibility
export function buildCategoryPrompt(input: VerseInsightInput, category: InsightCategory): PromptPayload {
  return buildBatchPrompt(input, [category])
}

export function buildPrompt(input: VerseInsightInput): PromptPayload {
  return buildBatchPrompt(input, CATEGORY_BATCHES[0])
}