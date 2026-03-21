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

export const VERSION = 'v1.4'

export const CATEGORIES = [
  'word_study',
  'quotes',
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
  ['practical', 'theology_by_tradition', 'application', 'quotes'],
]

// const CATEGORY_DESCRIPTIONS: Record<InsightCategory, string> = {
//   word_study:
//     'Key Greek (NT) or Hebrew (OT) words. For each: title = "originalWord (transliteration)" e.g. "λόγoς (logos)" or "חֶסֶד (hesed)". Content = why this word matters theologically. Only flag genuinely significant words.',
//   cross_refs:
//     'Related Bible verses — just the reference (e.g. "Rom 5:1") and a single phrase on why it connects. No quotes, no explanation paragraphs. Prefer less-obvious connections over the standard ones.',
//   practical:
//     'A concrete analogy or illustration accessible to all ages. One clear image, theologically precise.',
//   theology_by_tradition:
//     'Where traditions meaningfully diverge on this verse. Only include traditions with a real stake here. Include source_label and source_url when a reliable source is known.',
//   context:
//     'One historical or cultural fact that would surprise most readers and directly illuminates meaning. Include source_label and source_url when a reliable source is known.',
//   application:
//     'One specific, concrete application grounded in the passage\'s own logic — not generic.',
//   quotes:
//     'Memorable quotes from respected theologians in the teacher\'s tradition that illuminate this verse. Format title as "Theologian Name (dates)". Content = the quote itself (15–40 words). Include source_label and source_url for the original or a reliable edition whenever known. Only include genuine, historically attested quotes — no fabrications. Max 2 per verse.',
// }

const CATEGORY_DESCRIPTIONS: Record<InsightCategory, string> = {
  word_study:
    'Lexical insight on significant original-language words. Title: "English | Greek/Hebrew (translit)". Content: most likely contextual sense and why it matters.',
  cross_refs:
    'Related Bible references. Title: verse reference only. Content: one short phrase explaining the connection.',
  practical:
    'One concrete illustration or analogy. Clear and theologically precise.',
  theology_by_tradition:
    'Only real, meaningful tradition differences on this verse. Include source_label and source_url only when known.',
  context:
    'One historical or cultural fact that directly clarifies the verse. Include source_label and source_url only when known.',
  application:
    'One concrete application grounded in the verse, not generic.',
  quotes:
    'Short genuine quote from a respected theologian in the teacher tradition. Title: "Name (dates)". Content: quote only. Include source_label and source_url only when known.',
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
      const words = input.selectedWords?.[v.verse_ref]
      const wordsLine = words?.length
        ? `\n  Study these specific words: ${words.join(', ')}`
        : ''
      return `[${v.verse_ref}] ${v.text}${notesLine}${wordsLine}`
    })
    .join('\n')

  // If teacher selected specific words, make sure the instruction is prominent
   const hasSelectedWords = Object.values(input.selectedWords ?? {}).some(w => w.length > 0)
  
   // const traditionClause = tradition
  // ? ` Interpret in line with this tradition where relevant: ${tradition}.`
  // : ''
  // const wordStudyInstruction = hasSelectedWords
  // ? `- WORD STUDY: selectedWords only, ordered, no extras. Lexical analysis. Give the most likely contextual sense.${traditionClause} Title: English | Greek/Hebrew (translit).`
  // : `- WORD STUDY: key passage words/phrases. Lexical analysis. Give the most likely contextual sense.${traditionClause} Title: English | Greek/Hebrew (translit).`
  
    const traditionClause = tradition ? ` ${tradition}.` : ''
    const wordStudyInstruction = hasSelectedWords
    ? `- WORD STUDY: selectedWords only, ordered, no extras. Contextual lexical sense.${traditionClause} Title: English | Greek/Hebrew (translit).`
    : `- WORD STUDY: key passage words/phrases. Contextual lexical sense.${traditionClause} Title: English | Greek/Hebrew (translit).`

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
            {
        "title": "Short label",
        "content": "1-2 sentences max",
        "source_label": "Optional source title",
        "source_url": "Optional direct URL"
      }
    ]
  }
]

// Rules:
// - Return ONLY the JSON array.
// - One object per verse per category (${verses.length} verses × ${categories.length} categories = ${verses.length * categories.length} objects total).
// - Verses: ${verseRefs}
// - Categories and what they mean:
// ${categorySpec}
// - items: MAX 3 per object. 1-2 sentences per item. Concise and specific.
// - Cross-verse reasoning encouraged — insights may reference other verses in the passage.
// - Teacher's tradition: ${tradition}. Weight application and theology_by_tradition accordingly.
// - For quotes, context, and theology/history claims, include source_label and source_url when you know a reliable direct source.
// - If you are unsure of a source, omit source_label and source_url rather than guessing.
// - Never fabricate quotes, citations, or URLs.

Rules:
- Return ONLY the JSON array.
- One object per verse per category (${verses.length} verses × ${categories.length} categories = ${verses.length * categories.length} objects total).
- Verses: ${verseRefs}
- Categories:
${categorySpec}
- items: MAX 2 per object.
- Keep content brief: 1 short sentence, 2 only if needed.
- No filler. No repeated ideas across categories.
- Cross-verse reasoning allowed.
- Teacher tradition: ${tradition}. Weight application and theology_by_tradition accordingly.
- ${wordStudyInstruction}
- Include source_label and source_url only when you know a reliable source.
- If unsure, omit source_label and source_url.
- Never fabricate quotes, citations, or URLs.`



const user = `Passage: ${sessionTitle} (${sessionType})

${passageText}

Generate ${categories.join(', ')}. JSON only.`

  return { system, user, version: VERSION, temperature: 0.3 }
}

// Keep for backwards compatibility
export function buildCategoryPrompt(input: VerseInsightInput, category: InsightCategory): PromptPayload {
  return buildBatchPrompt(input, [category])
}

export function buildPrompt(input: VerseInsightInput): PromptPayload {
  return buildBatchPrompt(input, CATEGORY_BATCHES[0])
}
