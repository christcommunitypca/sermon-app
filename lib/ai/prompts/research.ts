// ── lib/ai/prompts/research.ts ────────────────────────────────────────────────
// Builds prompt payloads for all research categories.
// VERSION bump to v1.1 — improved word study, theological, and related text prompts.

import type { PromptPayload } from '@/lib/ai/types'
import type { ResearchInput } from '@/lib/ai/types'
import type { ResearchCategory } from '@/types/database'
import { traditionDisplayName } from '@/lib/liturgical'

export const VERSION = 'v1.1'

export const CATEGORY_SOURCE_LABEL: Record<ResearchCategory, string> = {
  word_study:     'AI synthesis · biblical scholarship',
  related_text:   'AI synthesis · cross-reference',
  theological:    'AI synthesis · theological interpretation',
  practical:      'AI synthesis · preaching suggestion',
  historical:     'AI synthesis · historical interpretation',
  denominational: 'AI synthesis · denominational context',
  current_topic:  'AI synthesis · current topic connection',
}

export function buildPrompt(input: ResearchInput): PromptPayload {
  switch (input.category) {
    case 'word_study':      return buildWordStudyPrompt(input)
    case 'related_text':    return buildRelatedTextPrompt(input)
    case 'theological':     return buildTheologicalPrompt(input)
    case 'practical':       return buildPracticalPrompt(input)
    case 'historical':      return buildHistoricalPrompt(input)
    case 'denominational':
    case 'current_topic':
      throw new Error(`Category "${input.category}" is not yet supported.`)
  }
}

// ── Word study ─────────────────────────────────────────────────────────────────

function buildWordStudyPrompt(input: ResearchInput): PromptPayload {
  const system = `You are a biblical scholar helping a pastor prepare to preach.
Return ONLY a JSON array. No markdown, no explanation.
Each item: { title, content, subcategory, confidence, metadata }
- title: the English word as it appears in the passage (e.g. "grace", "justified", "abide")
- content: 3–5 sentences. Lead with what this word actually meant in its original context,
  then explain what it means in THIS passage specifically, then why it matters for preaching.
  Be a scholar helping a practitioner, not writing a lexicon entry.
- subcategory: "word"
- confidence: "high" | "medium" | "low"
- metadata:
  - word: the original language spelling (Greek or Hebrew characters if possible, else transliteration)
  - original_language: "hebrew" | "greek" | "aramaic"
  - strongs_ref: Strong's number if confidently known (e.g. "G5485"), else null
  - semantic_range: array of 2–4 short meaning facets (e.g. ["unmerited favor", "gift", "beauty"])
    Keep each facet to 1–3 words. These appear as chips in the UI.

Generate 4–6 words. Avoid the obvious (e.g. "God", "Lord" unless they are the theological point).
Favor words where the original language meaningfully deepens the English.`

  const user = `Passage: ${input.scriptureRef}
Session: "${input.sessionTitle}" (${input.sessionType})
${input.sessionNotes ? `Notes from pastor: ${input.sessionNotes}` : ''}

Which words in this passage have the most original-language depth for preaching?`

  return { system, user, version: VERSION, temperature: 0.3 }
}

// ── Related texts ──────────────────────────────────────────────────────────────

function buildRelatedTextPrompt(input: ResearchInput): PromptPayload {
  const system = `You are a biblical scholar. Return ONLY a JSON array. No markdown.
Each item: { title, content, subcategory, confidence, metadata }
- title: the scripture reference ONLY (e.g. "Romans 5:8", "Isaiah 53:5")
  Do not include any other text in the title — just the reference.
- content: 2–3 sentences. Start with ONE sentence explaining the direct connection to the primary passage.
  Then 1–2 sentences on how a preacher could use this connection in the message.
- subcategory: "cross_ref_common" for widely used connections, "cross_ref_less_common" for less obvious but genuinely fitting
- confidence: "high" | "medium" | "low"
- metadata:
  - ref: the scripture reference as a string (same as title)
  - testament: "old" | "new"
  - relation_type: "common" | "less_common"
  - connection_type: "fulfillment" | "parallel" | "contrast" | "theme" | "quotation" | "allusion"

Return 4–5 common references and 2–3 less-common ones (6–8 total).
For less-common refs: only include if the connection is genuinely illuminating, not merely topical.`

  const user = `Primary passage: ${input.scriptureRef}
Session: "${input.sessionTitle}" (${input.sessionType})
Tradition: ${traditionDisplayName(input.tradition)}

Find the most useful cross-references for preaching this passage.`

  return { system, user, version: VERSION, temperature: 0.3 }
}

// ── Theological ────────────────────────────────────────────────────────────────

function buildTheologicalPrompt(input: ResearchInput): PromptPayload {
  const tradName = traditionDisplayName(input.tradition)

  const system = `You are a theological scholar. Return ONLY a JSON array. No markdown.
Each item: { title, content, subcategory, confidence, metadata }
- title: short, specific label (e.g. "Reformed: unconditional election", "Arminian: prevenient grace")
  For the primary tradition, start with the tradition name. For contrasting views, label clearly.
- content: Start with ONE plain-language sentence summarizing the interpretive position.
  Then 2–4 sentences of substantive explanation — what does this tradition emphasize,
  what textual evidence do they point to, and what are the pastoral implications?
  Do not be generic. Be specific to THIS passage.
- subcategory: "primary_tradition" | "cross_tradition"
- confidence: "high" | "medium" | "low"
- metadata:
  - tradition: name of the tradition (string)
  - is_cross_tradition: boolean
  - key_emphasis: one sentence capturing the core interpretive distinctive

Return 2–3 items from the primary tradition (${tradName}), then 2–3 contrasting perspectives.
Only include contrasting views where THIS passage is genuinely interpreted differently across traditions.
Avoid padding with views that are essentially the same.`

  const user = `Passage: ${input.scriptureRef}
Teacher's tradition: ${tradName}
Session: "${input.sessionTitle}"

How do theologians in the ${tradName} tradition interpret this passage?
Then: where do other traditions genuinely interpret it differently?`

  return { system, user, version: VERSION, temperature: 0.3 }
}

// ── Practical ─────────────────────────────────────────────────────────────────

function buildPracticalPrompt(input: ResearchInput): PromptPayload {
  const system = `You are an experienced preaching coach. Return ONLY a JSON array. No markdown.
Each item: { title, content, subcategory, confidence, metadata }
- subcategory: "application" | "analogy" | "insight"
- title: evocative short label that a pastor could use as a sermon point label
- content: 2–4 vivid, specific sentences.
  - application: direct and concrete. Name a specific type of person or life situation.
    Avoid vague "apply this to your life" language.
  - analogy: a clear, contemporary comparison that makes the text click.
    Make it specific — name the situation, the object, the person.
  - insight: an explanatory observation that resolves something puzzling or deepens understanding.
    What does this passage say that surprises, challenges, or reframes common thinking?
- confidence: "high" | "medium" | "low"
- metadata:
  - subcategory: same as above
  - suggested_block_type: "application" | "illustration" | "point"
  - audience_context: brief note on who this is most relevant to (optional)

Return 3–4 applications, 2–3 analogies, 2–3 insights (8–10 total).
Be specific. Generic suggestions are useless to a pastor preparing a real sermon.`

  const user = `Passage: ${input.scriptureRef}
Session: "${input.sessionTitle}" (${input.sessionType})
${input.sessionNotes ? `Pastor's notes: ${input.sessionNotes}` : ''}

Generate practical preaching material for this passage.`

  return { system, user, version: VERSION, temperature: 0.45 }
}

// ── Historical ────────────────────────────────────────────────────────────────

function buildHistoricalPrompt(input: ResearchInput): PromptPayload {
  const system = `You are a church historian and biblical scholar. Return ONLY a JSON array. No markdown.
Each item: { title, content, subcategory, confidence, metadata }
- subcategory: "cultural_context" | "interpretive_history" | "early_church"
- title: short, specific label
- content: 3–4 sentences. Lead with the most directly useful fact for sermon prep,
  then explain why it matters for understanding the passage today.
  Avoid academic hedging. Be concise and direct.
- confidence: "high" | "medium" | "low"
- metadata:
  - subcategory: same as above
  - era: time period (e.g. "1st century Judea", "Patristic period", "16th century Reformation")

Return 1–2 items on original cultural context, 1 on interpretive history, and 1 on early church use.
Prioritize information that would meaningfully change how someone preaches this passage.`

  const user = `Passage: ${input.scriptureRef}
Session: "${input.sessionTitle}"

What historical and cultural context is most useful for preaching this passage?`

  return { system, user, version: VERSION, temperature: 0.3 }
}
