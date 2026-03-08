import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { decryptKey } from '@/lib/ai/key'
import { ResearchCategory, ResearchItem } from '@/types/database'
import { traditionDisplayName } from '@/lib/liturgical'

export const RESEARCH_PROMPT_VERSION = 'v1.0'

interface ResearchContext {
  scriptureRef: string
  sessionTitle: string
  sessionType: string
  sessionNotes?: string | null
  tradition: string
}

interface RawResearchItem {
  title: string
  content: string
  subcategory?: string
  confidence?: 'high' | 'medium' | 'low'
  metadata?: Record<string, unknown>
}

interface ResearchGenerateResult {
  items: Omit<ResearchItem, 'id' | 'session_id' | 'church_id' | 'teacher_id' | 'created_at'>[]
  model: string
  error?: string
}

// ── Resolve AI key ────────────────────────────────────────────────────────────
async function resolveKey(userId: string): Promise<{ key: string; model: string } | null> {
  const { data } = await supabaseAdmin
    .from('user_ai_keys')
    .select('openai_key_enc, model_preference, validation_status')
    .eq('user_id', userId)
    .single()

  if (!data || data.validation_status !== 'valid' || !data.openai_key_enc) return null

  try {
    const key = await decryptKey(data.openai_key_enc)
    return { key, model: data.model_preference ?? 'gpt-4o' }
  } catch {
    return null
  }
}

// ── Shared OpenAI call ────────────────────────────────────────────────────────
async function callOpenAI(
  key: string,
  model: string,
  system: string,
  user: string
): Promise<{ items: RawResearchItem[]; error?: string }> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        temperature: 0.3,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { items: [], error: body?.error?.message ?? `OpenAI error ${res.status}` }
    }

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? ''
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return { items: Array.isArray(parsed) ? parsed : [] }
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : 'Failed to parse response' }
  }
}

// ── Word Studies ──────────────────────────────────────────────────────────────
export async function generateWordStudies(
  userId: string,
  ctx: ResearchContext
): Promise<ResearchGenerateResult> {
  const auth = await resolveKey(userId)
  if (!auth) return { items: [], model: '', error: 'No valid AI key.' }

  const system = `You are a biblical scholar helping a pastor prepare to teach. 
Return ONLY a JSON array of word study objects. No markdown, no explanation.
Each object: { title, content, subcategory, confidence, metadata }
- title: the English word/phrase being studied (e.g. "grace" or "justify")  
- content: 3-5 sentences covering: original language word, basic meaning, theological significance, key usage in this passage
- subcategory: "word"
- confidence: "high" | "medium" | "low"
- metadata: { word (original language spelling), original_language ("hebrew"|"greek"|"aramaic"), strongs_ref (if known), semantic_range (array of meaning facets) }
Generate 4-6 theologically significant words. Favor words with depth, not obvious ones.`

  const userMsg = `Passage: ${ctx.scriptureRef}
Session title: ${ctx.sessionTitle}
Type: ${ctx.sessionType}
${ctx.sessionNotes ? `Notes: ${ctx.sessionNotes}` : ''}

Identify and study the most theologically significant words from this passage.`

  const { items, error } = await callOpenAI(auth.key, auth.model, system, userMsg)
  if (error) return { items: [], model: auth.model, error }

  return {
    model: auth.model,
    items: items.map((item, i) => ({
      category: 'word_study' as ResearchCategory,
      subcategory: 'word',
      title: item.title,
      content: item.content,
      source_label: `AI synthesis · biblical scholarship`,
      source_type: 'ai_synthesis' as const,
      confidence: item.confidence ?? 'medium',
      is_pinned: false,
      is_dismissed: false,
      metadata: item.metadata ?? {},
      position: i,
    })),
  }
}

// ── Related Texts ─────────────────────────────────────────────────────────────
export async function generateRelatedTexts(
  userId: string,
  ctx: ResearchContext
): Promise<ResearchGenerateResult> {
  const auth = await resolveKey(userId)
  if (!auth) return { items: [], model: '', error: 'No valid AI key.' }

  const system = `You are a biblical scholar. Return ONLY a JSON array of cross-reference objects. No markdown.
Each: { title, content, subcategory, confidence, metadata }
- title: scripture reference (e.g. "John 3:16")
- content: 2-3 sentences explaining the connection to the primary passage
- subcategory: "cross_ref_common" for well-known connections, "cross_ref_less_common" for less obvious but fitting ones
- confidence: "high" | "medium" | "low"  
- metadata: { ref (string), testament ("old"|"new"), relation_type ("common"|"less_common") }
Return 4-5 common cross-references and 2-3 less-common but fitting ones (total 6-8 items).`

  const userMsg = `Primary passage: ${ctx.scriptureRef}
Session: "${ctx.sessionTitle}" (${ctx.sessionType})
Tradition: ${traditionDisplayName(ctx.tradition)}

Find cross-references that would strengthen this teaching.`

  const { items, error } = await callOpenAI(auth.key, auth.model, system, userMsg)
  if (error) return { items: [], model: auth.model, error }

  return {
    model: auth.model,
    items: items.map((item, i) => ({
      category: 'related_text' as ResearchCategory,
      subcategory: item.subcategory ?? 'cross_ref_common',
      title: item.title,
      content: item.content,
      source_label: `AI synthesis · cross-reference`,
      source_type: 'ai_synthesis' as const,
      confidence: item.confidence ?? 'medium',
      is_pinned: false,
      is_dismissed: false,
      metadata: item.metadata ?? {},
      position: i,
    })),
  }
}

// ── Theological Interpretation ────────────────────────────────────────────────
export async function generateTheologicalInsights(
  userId: string,
  ctx: ResearchContext
): Promise<ResearchGenerateResult> {
  const auth = await resolveKey(userId)
  if (!auth) return { items: [], model: '', error: 'No valid AI key.' }

  const tradName = traditionDisplayName(ctx.tradition)

  const system = `You are a theological scholar. Return ONLY a JSON array. No markdown.
Each: { title, content, subcategory, confidence, metadata }
- title: brief label for the interpretive perspective (e.g. "Reformed view: election and grace" or "Methodist: prevenient grace emphasis")
- content: 3-5 sentences of substantive theological interpretation, not generic summary
- subcategory: "primary_tradition" for the teacher's tradition, "cross_tradition" for others
- confidence: "high" | "medium" | "low"
- metadata: { tradition (string), is_cross_tradition (boolean) }
Return 2-3 items from the primary tradition and 2-3 contrasting perspectives from other traditions.
Be specific and substantive — avoid vague platitudes. Note genuine interpretive differences.`

  const userMsg = `Passage: ${ctx.scriptureRef}
Teacher's tradition: ${tradName}
Session: "${ctx.sessionTitle}"

Provide theological interpretation from the ${tradName} perspective, then 2-3 contrasting perspectives from other traditions where the passage is interpreted differently.`

  const { items, error } = await callOpenAI(auth.key, auth.model, system, userMsg)
  if (error) return { items: [], model: auth.model, error }

  return {
    model: auth.model,
    items: items.map((item, i) => ({
      category: 'theological' as ResearchCategory,
      subcategory: item.subcategory ?? 'primary_tradition',
      title: item.title,
      content: item.content,
      source_label: item.metadata?.is_cross_tradition
        ? `AI synthesis · ${item.metadata?.tradition ?? 'cross-tradition'} perspective`
        : `AI synthesis · ${tradName} interpretation`,
      source_type: 'ai_synthesis' as const,
      confidence: item.confidence ?? 'medium',
      is_pinned: false,
      is_dismissed: false,
      metadata: item.metadata ?? {},
      position: i,
    })),
  }
}

// ── Practical Helps ───────────────────────────────────────────────────────────
export async function generatePracticalHelps(
  userId: string,
  ctx: ResearchContext
): Promise<ResearchGenerateResult> {
  const auth = await resolveKey(userId)
  if (!auth) return { items: [], model: '', error: 'No valid AI key.' }

  const system = `You are a preaching coach. Return ONLY a JSON array. No markdown.
Each: { title, content, subcategory, confidence, metadata }
- subcategory: "application" | "analogy" | "insight"
- title: short evocative label
- content: 2-4 sentences. Practical, vivid, sermon-ready.
  - For applications: direct, concrete, life-relevant
  - For analogies: clear comparisons that illuminate the text
  - For insights: explanatory observations that make the text click
- confidence: "high" | "medium" | "low"  
- metadata: { subcategory, suggested_block_type ("application"|"illustration"|"point") }
Return 3-4 applications, 2-3 analogies, 2-3 explanatory insights (8-10 items total).`

  const userMsg = `Passage: ${ctx.scriptureRef}
Session: "${ctx.sessionTitle}" (${ctx.sessionType})
${ctx.sessionNotes ? `Notes: ${ctx.sessionNotes}` : ''}

Generate practical preaching helps: applications, analogies, and explanatory insights.`

  const { items, error } = await callOpenAI(auth.key, auth.model, system, userMsg)
  if (error) return { items: [], model: auth.model, error }

  return {
    model: auth.model,
    items: items.map((item, i) => ({
      category: 'practical' as ResearchCategory,
      subcategory: item.subcategory ?? 'application',
      title: item.title,
      content: item.content,
      source_label: 'AI synthesis · preaching suggestion',
      source_type: 'ai_synthesis' as const,
      confidence: item.confidence ?? 'medium',
      is_pinned: false,
      is_dismissed: false,
      metadata: item.metadata ?? {},
      position: i,
    })),
  }
}

// ── Historical Interpretation ─────────────────────────────────────────────────
export async function generateHistoricalInsights(
  userId: string,
  ctx: ResearchContext
): Promise<ResearchGenerateResult> {
  const auth = await resolveKey(userId)
  if (!auth) return { items: [], model: '', error: 'No valid AI key.' }

  const system = `You are a church historian and biblical scholar. Return ONLY a JSON array. No markdown.
Each: { title, content, subcategory, confidence, metadata }
- subcategory: "cultural_context" | "interpretive_history" | "early_church"
- title: short descriptive label
- content: 3-5 sentences. Practical for sermon prep, not academic clutter.
- confidence: "high" | "medium" | "low"
- metadata: { subcategory, era (e.g. "1st century", "Reformation", "Patristic") }
Return 2-3 items covering: original cultural/historical context, how the text has been interpreted historically, and relevant early church perspective.`

  const userMsg = `Passage: ${ctx.scriptureRef}
Session: "${ctx.sessionTitle}"

Provide concise historical and cultural context that would practically help a pastor teach this passage today.`

  const { items, error } = await callOpenAI(auth.key, auth.model, system, userMsg)
  if (error) return { items: [], model: auth.model, error }

  return {
    model: auth.model,
    items: items.map((item, i) => ({
      category: 'historical' as ResearchCategory,
      subcategory: item.subcategory ?? 'cultural_context',
      title: item.title,
      content: item.content,
      source_label: 'AI synthesis · historical interpretation',
      source_type: 'ai_synthesis' as const,
      confidence: item.confidence ?? 'medium',
      is_pinned: false,
      is_dismissed: false,
      metadata: item.metadata ?? {},
      position: i,
    })),
  }
}

// ── Dispatch by category ──────────────────────────────────────────────────────
export async function generateResearchCategory(
  userId: string,
  category: ResearchCategory,
  ctx: ResearchContext
): Promise<ResearchGenerateResult> {
  switch (category) {
    case 'word_study':       return generateWordStudies(userId, ctx)
    case 'related_text':     return generateRelatedTexts(userId, ctx)
    case 'theological':      return generateTheologicalInsights(userId, ctx)
    case 'practical':        return generatePracticalHelps(userId, ctx)
    case 'historical':       return generateHistoricalInsights(userId, ctx)
    case 'denominational':
    case 'current_topic':
      // Stubbed — architecture in place, generation not implemented yet
      return { items: [], model: '', error: 'This category is not yet available.' }
    default:
      return { items: [], model: '', error: `Unknown category: ${category}` }
  }
}
