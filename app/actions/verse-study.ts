'use server'

import { getActionUser } from '@/lib/supabase/auth-context'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { fetchPassage, type VerseData } from '@/lib/esv'
import {
  generateVerseInsights,
  generatePericopeInsights,
  type PericopeSection,
  generateLessonSummary,
  buildCopyablePrompt,
  buildCopyableVerseInsightsPrompt,
  splitStudyNotes,
  AIError,
} from '@/lib/ai/service'
import type { VerseInsightPromptConfig, VerseInsightDepth } from '@/lib/ai/types'
import { buildBatchPrompt, CATEGORY_BATCHES } from '@/lib/ai/prompts/verse-insights'
import { getUserTradition } from '@/lib/research'
import { getFlatRenderOrder } from '@/lib/outline'
import type { OutlineBlock, VerseNote } from '@/types/database'
import { ensureSharedStudyInsightsFromResearch } from '@/lib/study-content'

type InsightItem = {
  title: string
  content: string
  source_label?: string
  source_url?: string
  is_flagged?: boolean
  used_count?: number
}
// ── fetchVerseDataAction ───────────────────────────────────────────────────────
// Returns cached ESV text + saved insights + all verse notes.
// Called on page load and after AI generation.

export async function fetchVerseDataAction(
  sessionId: string,
  scriptureRef: string
): Promise<{
  verses: VerseData[] | null
  insights: Record<string, Record<string, {
    title: string
    content: string
    source_label?: string
    source_url?: string
  }[]>>
  verseNotes: Record<string, VerseNote[]>
  error: string | null
}> {
  const user = await getActionUser()
  if (!user) return { verses: null, insights: {}, verseNotes: {}, error: 'Session expired — please refresh.' }

  try {
    const verses = await fetchPassage(scriptureRef)

    const { data: session } = await supabaseAdmin
      .from('teaching_sessions')
      .select('church_id')
      .eq('id', sessionId)
      .eq('teacher_id', user.id)
      .single()

    if (session?.church_id) {
      await ensureSharedStudyInsightsFromResearch({
        sessionId,
        churchId: session.church_id,
        teacherId: user.id,
      })
    }

    const [{ data: insightRows }, { data: noteRows }] = await Promise.all([
      supabaseAdmin
        .from('verse_insights')
        .select('verse_ref, category, items')
        .eq('session_id', sessionId)
        .eq('teacher_id', user.id),
      supabaseAdmin
        .from('verse_notes')
        .select('*')
        .eq('session_id', sessionId)
        .eq('teacher_id', user.id)
        .order('verse_ref')
        .order('position'),
    ])

    const insights: Record<string, Record<string, {
      title: string
      content: string
      source_label?: string
      source_url?: string
    }[]>> = {}
    
    for (const row of insightRows ?? []) {
      if (!insights[row.verse_ref]) insights[row.verse_ref] = {}
      insights[row.verse_ref][row.category] = row.items as InsightItem[]
    }

    const verseNotes: Record<string, VerseNote[]> = {}
    for (const row of noteRows ?? []) {
      if (!verseNotes[row.verse_ref]) verseNotes[row.verse_ref] = []
      verseNotes[row.verse_ref].push(row as VerseNote)
    }

    return { verses, insights, verseNotes, error: null }
  } catch (err) {
    return {
      verses: null,
      insights: {},
      verseNotes: {},
      error: err instanceof Error ? err.message : 'Failed to load verse data',
    }
  }
}

// ── loadVerseNotesAction ───────────────────────────────────────────────────────
// Reload only notes (used after create/reorder without refetching ESV).

export async function loadVerseNotesAction(
  sessionId: string
): Promise<{ verseNotes: Record<string, VerseNote[]>; error: string | null }> {
  const user = await getActionUser()
  if (!user) return { verseNotes: {}, error: 'Session expired.' }

  const { data, error } = await supabaseAdmin
    .from('verse_notes')
    .select('*')
    .eq('session_id', sessionId)
    .eq('teacher_id', user.id)
    .order('verse_ref')
    .order('position')

  if (error) return { verseNotes: {}, error: error.message }

  const verseNotes: Record<string, VerseNote[]> = {}
  for (const row of data ?? []) {
    if (!verseNotes[row.verse_ref]) verseNotes[row.verse_ref] = []
    verseNotes[row.verse_ref].push(row as VerseNote)
  }
  return { verseNotes, error: null }
}

// ── createVerseNoteAction ──────────────────────────────────────────────────────
// Creates a new note for a verse. Assigns position = max + 1 for that verse.

export async function createVerseNoteAction(
  sessionId: string,
  churchId: string,
  verseRef: string,
  content: string
): Promise<{ note: VerseNote | null; error: string | null }> {
  const user = await getActionUser()
  if (!user) return { note: null, error: 'Session expired.' }

  // Get current max position for this verse
  const { data: existing } = await supabaseAdmin
    .from('verse_notes')
    .select('position')
    .eq('session_id', sessionId)
    .eq('teacher_id', user.id)
    .eq('verse_ref', verseRef)
    .order('position', { ascending: false })
    .limit(1)

  const nextPos = existing && existing.length > 0 ? existing[0].position + 1 : 0

  const { data, error } = await supabaseAdmin
    .from('verse_notes')
    .insert({
      session_id: sessionId,
      church_id: churchId,
      teacher_id: user.id,
      verse_ref: verseRef,
      content: content.trim(),
      position: nextPos,
    })
    .select()
    .single()

  return { note: error ? null : (data as VerseNote), error: error?.message ?? null }
}

// ── updateVerseNoteAction ──────────────────────────────────────────────────────
// Updates the content of a single note. Auto-saves on keystroke debounce.

export async function updateVerseNoteAction(
  noteId: string,
  content: string
): Promise<{ error: string | null }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const { error } = await supabaseAdmin
    .from('verse_notes')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .eq('teacher_id', user.id)

  return { error: error?.message ?? null }
}

// ── deleteVerseNoteAction ──────────────────────────────────────────────────────
// Deletes a note. Does not reindex positions — gaps are fine.

export async function deleteVerseNoteAction(
  noteId: string
): Promise<{ error: string | null }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const { error } = await supabaseAdmin
    .from('verse_notes')
    .delete()
    .eq('id', noteId)
    .eq('teacher_id', user.id)

  return { error: error?.message ?? null }
}

// ── reorderVerseNotesAction ────────────────────────────────────────────────────
// Accepts the full ordered array of note IDs for a verse and writes positions.
// Called after drag-to-reorder completes.

export async function reorderVerseNotesAction(
  noteIds: string[]
): Promise<{ error: string | null }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  // Batch update positions
  const updates = noteIds.map((id, idx) =>
    supabaseAdmin
      .from('verse_notes')
      .update({ position: idx })
      .eq('id', id)
      .eq('teacher_id', user.id)
  )

  const results = await Promise.all(updates)
  const failed = results.find((result: { error: { message: string } | null }) => result.error)
  return { error: failed?.error?.message ?? null }
}

// ── incrementNoteUsageAction ───────────────────────────────────────────────────
// Increments used_count when a note is placed into the outline.

export async function incrementNoteUsageAction(
  noteId: string
): Promise<{ error: string | null }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const { data: note } = await supabaseAdmin
    .from('verse_notes')
    .select('used_count')
    .eq('id', noteId)
    .eq('teacher_id', user.id)
    .single()

  if (!note) return { error: 'Note not found.' }

  const { error } = await supabaseAdmin
    .from('verse_notes')
    .update({ used_count: (note.used_count ?? 0) + 1 })
    .eq('id', noteId)
    .eq('teacher_id', user.id)

  return { error: error?.message ?? null }
}

// ── generateVerseInsightsAction ───────────────────────────────────────────────
// Runs AI generation for all verses × all 6 categories.
// Saves to DB before returning — never shows results without persisting first.

export async function generateVerseInsightsAction(
  sessionId: string,
  churchId: string,
  selectedWords?: Record<string, string[]>,
  config?: VerseInsightPromptConfig
): Promise<{ error: string | null; count: number }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh.', count: 0 }

  try {
    const { data: session } = await supabaseAdmin
      .from('teaching_sessions')
      .select('title, type, scripture_ref')
      .eq('id', sessionId)
      .eq('teacher_id', user.id)
      .single()

    if (!session) return { error: 'Session not found.', count: 0 }
    if (!session.scripture_ref) return { error: 'No scripture reference set on this session.', count: 0 }

    const verses = await fetchPassage(session.scripture_ref)
    if (verses.length === 0) return { error: 'Could not load scripture text.', count: 0 }
    const scopedVerses = config?.scope === 'selected_verses' && (config?.verseRefs?.length ?? 0) > 0
      ? verses.filter(v => config?.verseRefs?.includes(v.verse_ref))
      : verses
    if (scopedVerses.length === 0) return { error: 'No verses selected.', count: 0 }

    // Load pastor's notes to send as context for more relevant insights
    const { data: noteRows } = await supabaseAdmin
      .from('verse_notes')
      .select('verse_ref, content')
      .eq('session_id', sessionId)
      .eq('teacher_id', user.id)
      .order('position')

    const notesContext: Record<string, string[]> = {}
    for (const row of noteRows ?? []) {
      if (!notesContext[row.verse_ref]) notesContext[row.verse_ref] = []
      notesContext[row.verse_ref].push(row.content)
    }

    const tradition = await getUserTradition(user.id)

    const result = await generateVerseInsights(user.id, {
      verses: scopedVerses,
      sessionTitle: session.title,
      sessionType: session.type,
      tradition,
      pastorNotes: notesContext,
      selectedWords: selectedWords ?? {},
      config,
    })

    // Save ALL rows before returning — never show without persisting
    const rows = result.insights.map(insight => ({
      session_id: sessionId,
      church_id: churchId,
      teacher_id: user.id,
      verse_ref: insight.verse_ref,
      category: insight.category,
      items:
      insight.category === 'word_study'
        ? filterWordStudyItems(
        dedupeInsightItems(insight.items ?? []),
        selectedWords?.[insight.verse_ref] ?? []
        )
        : dedupeInsightItems(insight.items ?? []),
      model: result.model,
      prompt_version: result.prompt_version,
      generated_at: new Date().toISOString(),
    }))

    const { error: upsertError } = await supabaseAdmin
      .from('verse_insights')
      .upsert(rows, { onConflict: 'session_id,verse_ref,category' })

    if (upsertError) {
      console.error('[generateVerseInsightsAction] upsert failed:', upsertError.message)
      return { error: `Failed to save insights: ${upsertError.message}`, count: 0 }
    }

    return { error: null, count: rows.length }
  } catch (err) {
    if (err instanceof AIError) return { error: err.message, count: 0 }
    return { error: err instanceof Error ? err.message : 'Generation failed', count: 0 }
  }
}

export async function getVerseInsightsPromptAction(
  sessionId: string,
  selectedWords?: Record<string, string[]>,
  config?: VerseInsightPromptConfig
): Promise<{ prompt: string | null; error: string | null }> {
  const user = await getActionUser()
  if (!user) return { prompt: null, error: 'Session expired — please refresh.' }

  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('title, type, scripture_ref')
    .eq('id', sessionId)
    .eq('teacher_id', user.id)
    .single()

  if (!session) return { prompt: null, error: 'Session not found.' }
  if (!session.scripture_ref) return { prompt: null, error: 'No scripture reference set on this session.' }

  const verses = await fetchPassage(session.scripture_ref)
  const scopedVerses = config?.scope === 'selected_verses' && (config?.verseRefs?.length ?? 0) > 0
    ? verses.filter(v => config?.verseRefs?.includes(v.verse_ref))
    : verses

  const { data: noteRows } = await supabaseAdmin
    .from('verse_notes')
    .select('verse_ref, content')
    .eq('session_id', sessionId)
    .eq('teacher_id', user.id)
    .order('position')

  const notesContext: Record<string, string[]> = {}
  for (const row of noteRows ?? []) {
    if (!notesContext[row.verse_ref]) notesContext[row.verse_ref] = []
    notesContext[row.verse_ref].push(row.content)
  }

  const tradition = await getUserTradition(user.id)
  const prompt = buildCopyableVerseInsightsPrompt({
    verses: scopedVerses,
    sessionTitle: session.title,
    sessionType: session.type,
    tradition,
    pastorNotes: notesContext,
    selectedWords: selectedWords ?? {},
    config,
  })

  return { prompt, error: null }
}

// ── generateLessonSummaryAction ────────────────────────────────────────────────

export async function generateLessonSummaryAction(
  sessionId: string,
  blocks: OutlineBlock[]
): Promise<{
  estimated_minutes: number | null
  key_theme: string | null
  titles: string[]
  error: string | null
}> {
  const user = await getActionUser()
  if (!user) return { estimated_minutes: null, key_theme: null, titles: [], error: 'Session expired.' }

  try {
    const { data: session } = await supabaseAdmin
      .from('teaching_sessions')
      .select('title, scripture_ref, estimated_duration')
      .eq('id', sessionId)
      .eq('teacher_id', user.id)
      .single()

    if (!session) return { estimated_minutes: null, key_theme: null, titles: [], error: 'Session not found.' }

    const tradition = await getUserTradition(user.id)
    const outlineText = buildOutlineText(blocks)

    const result = await generateLessonSummary(user.id, {
      outlineText,
      scriptureRef: session.scripture_ref,
      tradition,
      targetMinutes: session.estimated_duration,
    })

    return {
      estimated_minutes: result.estimated_minutes,
      key_theme: result.key_theme,
      titles: result.titles,
      error: null,
    }
  } catch (err) {
    if (err instanceof AIError) return { estimated_minutes: null, key_theme: null, titles: [], error: err.message }
    return { estimated_minutes: null, key_theme: null, titles: [], error: 'Generation failed.' }
  }
}

// ── getLessonSummaryPromptAction ───────────────────────────────────────────────

export async function getLessonSummaryPromptAction(
  sessionId: string,
  blocks: OutlineBlock[]
): Promise<{ prompt: string | null; error: string | null }> {
  const user = await getActionUser()
  if (!user) return { prompt: null, error: 'Session expired.' }

  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('scripture_ref, estimated_duration')
    .eq('id', sessionId)
    .eq('teacher_id', user.id)
    .single()

  if (!session) return { prompt: null, error: 'Session not found.' }

  const tradition = await getUserTradition(user.id)

  const prompt = buildCopyablePrompt({
    outlineText: buildOutlineText(blocks),
    scriptureRef: session.scripture_ref,
    tradition,
    targetMinutes: session.estimated_duration,
  })

  return { prompt, error: null }
}


// ── helpers ───────────────────────────────────────────────────────────────────

function buildOutlineText(blocks: OutlineBlock[]): string {
  const flat = getFlatRenderOrder(blocks)
  return flat
    .map(b => {
      const indent = '  '.repeat(getBlockDepth(blocks, b.id))
      const mins = b.estimated_minutes ? ` [${b.estimated_minutes}m]` : ''
      return `${indent}${b.type.toUpperCase()}: ${b.content}${mins}`
    })
    .join('\n')
}

function getBlockDepth(blocks: OutlineBlock[], id: string, depth = 0): number {
  const block = blocks.find(b => b.id === id)
  if (!block || !block.parent_id) return depth
  return getBlockDepth(blocks, block.parent_id, depth + 1)
}

// ── Increment used_count when a note is placed into outline ───────────────────
export async function incrementNoteUsedCountAction(noteId: string): Promise<void> {
  const { supabaseAdmin } = await import('@/lib/supabase/admin')
  await supabaseAdmin.rpc('increment_note_used_count', { note_id: noteId })
}

// ── Increment used_count when a research item is placed into outline ──────────
export async function incrementResearchUsedCountAction(itemId: string): Promise<void> {
  const { supabaseAdmin } = await import('@/lib/supabase/admin')
  await supabaseAdmin.rpc('increment_research_used_count', { item_id: itemId })
}

// ── Toggle is_flagged on a verse_insight item ─────────────────────────────────
// verse_insights stores items as a JSON array: [{ title, content, is_flagged? }]
// We update the specific item in the array by index.
export async function toggleInsightFlagAction(
  sessionId: string,
  verseRef: string,
  category: string,
  itemIndex: number,
  flagged: boolean
): Promise<{ error: string | null }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired' }

  const { supabaseAdmin } = await import('@/lib/supabase/admin')

  // Fetch current items
  const { data, error } = await supabaseAdmin
    .from('verse_insights')
    .select('items')
    .eq('session_id', sessionId)
    .eq('teacher_id', user.id)
    .eq('verse_ref', verseRef)
    .eq('category', category)
    .single()

  if (error || !data) return { error: 'Insight not found' }

  const items = (data.items as { title: string; content: string; is_flagged?: boolean }[])
  if (!items[itemIndex]) return { error: 'Item index out of range' }

  items[itemIndex] = { ...items[itemIndex], is_flagged: flagged }

  const { error: updateError } = await supabaseAdmin
    .from('verse_insights')
    .update({ items })
    .eq('session_id', sessionId)
    .eq('teacher_id', user.id)
    .eq('verse_ref', verseRef)
    .eq('category', category)

  return { error: updateError?.message ?? null }
}

// ── Increment used_count on a verse_insight item ──────────────────────────────
export async function incrementInsightUsedCountAction(
  sessionId: string,
  verseRef: string,
  category: string,
  itemIndex: number
): Promise<{ error: string | null }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired' }

  const { supabaseAdmin } = await import('@/lib/supabase/admin')

  const { data, error } = await supabaseAdmin
    .from('verse_insights')
    .select('items')
    .eq('session_id', sessionId)
    .eq('teacher_id', user.id)
    .eq('verse_ref', verseRef)
    .eq('category', category)
    .single()

  if (error || !data) return { error: 'Insight not found' }

  const items = data.items as InsightItem[]
  if (!items[itemIndex]) return { error: 'Item index out of range' }

  items[itemIndex] = { ...items[itemIndex], used_count: (items[itemIndex].used_count ?? 0) + 1 }

  const { error: updateError } = await supabaseAdmin
    .from('verse_insights')
    .update({ items })
    .eq('session_id', sessionId)
    .eq('teacher_id', user.id)
    .eq('verse_ref', verseRef)
    .eq('category', category)

  return { error: updateError?.message ?? null }
}

export async function clearVerseInsightsAction(
  sessionId: string,
  verseRefs: string[]
): Promise<{ error: string | null; count: number }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh.', count: 0 }
  if (!verseRefs.length) return { error: null, count: 0 }

  const { data, error } = await supabaseAdmin
    .from('verse_insights')
    .delete()
    .eq('session_id', sessionId)
    .eq('teacher_id', user.id)
    .in('verse_ref', verseRefs)
    .select('verse_ref')

  return { error: error?.message ?? null, count: data?.length ?? 0 }
}

export async function getPericopeInsightsPromptAction(
  sessionId: string,
  sections: PericopeSection[],
  selectedWordsBySection?: Record<string, string[]>,
  config?: VerseInsightPromptConfig
): Promise<{ humanPrompt: string | null; llmPrompt: string | null; error: string | null }> {
  const user = await getActionUser()
  if (!user) return { humanPrompt: null, llmPrompt: null, error: 'Session expired — please refresh.' }

  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('title, type')
    .eq('id', sessionId)
    .eq('teacher_id', user.id)
    .single()

  if (!session) return { humanPrompt: null, llmPrompt: null, error: 'Session not found.' }
  if (!sections.length) return { humanPrompt: null, llmPrompt: null, error: 'No sections provided.' }

  const tradition = await getUserTradition(user.id)

  const rendered = sections.map((section, sectionIndex) => {
    const pericopeKey = `pericope:${section.startVerse}`
    const selectedWords = (selectedWordsBySection?.[pericopeKey] ?? []).slice(0, 5)
    const combinedVerseData: VerseData = {
      verse_ref: pericopeKey,
      verse_num: 1,
      text: section.verses.map(v => `[${v.verse_ref}] ${v.text}`).join(' '),
    }

    const promptInput = {
      verses: [combinedVerseData],
      sessionTitle: session.title,
      sessionType: session.type,
      tradition,
      selectedWords: selectedWords.length ? { [pericopeKey]: selectedWords } : {},
      config,
    }

    const human = [
      `SECTION ${sectionIndex + 1}: ${section.label}`,
      '',
      buildCopyableVerseInsightsPrompt(promptInput),
    ].join('\n')

    const llm = CATEGORY_BATCHES.map((batch, batchIndex) => {
      const prompt = buildBatchPrompt(promptInput, batch)
      return [
        `SECTION ${sectionIndex + 1}: ${section.label}`,
        `BATCH ${batchIndex + 1}: ${batch.join(', ')}`,
        '',
        'SYSTEM',
        prompt.system,
        '',
        'USER',
        prompt.user,
      ].join('\n')
    }).join('\n\n------------------------------\n\n')

    return { human, llm }
  })

  return {
    humanPrompt: rendered.map(r => r.human).join('\n\n==============================\n\n'),
    llmPrompt: rendered.map(r => r.llm).join('\n\n==============================\n\n'),
    error: null,
  }
}

// ── generatePericopeInsightsAction ───────────────────────────────────────────
// Generates insights for a single pericope section.
// Uses section label as verse_ref key — coexists with per-verse data.

export async function generatePericopeInsightsAction(
  sessionId: string,
  churchId: string,
  section: PericopeSection,
  selectedWords: string[] = [],
  config?: VerseInsightPromptConfig | VerseInsightDepth,
): Promise<{
  error: string | null
  sectionKey?: string
  insights?: Record<string, {
    title: string
    content: string
    source_label?: string
    source_url?: string
  }[]>
}> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh.' }

  try {
    const { data: session } = await supabaseAdmin
      .from('teaching_sessions')
      .select('title, type')
      .eq('id', sessionId)
      .eq('teacher_id', user.id)
      .single()

    if (!session) return { error: 'Session not found.' }

    const tradition = await getUserTradition(user.id)
    const sectionKey = `pericope:${section.startVerse}`
    const resolvedConfig: VerseInsightPromptConfig =
      typeof config === 'string'
        ? { depth: config }
        : (config ?? { depth: 'quick' })

    const result = await generatePericopeInsights(user.id, {
      section: {
        ...section,
        selectedWords,
      },
      sessionTitle: session.title,
      sessionType: session.type,
      tradition,
      selectedWords,
      config: resolvedConfig,
    })

    const generatedAt = new Date().toISOString()

    const merged = new Map<string, {
      session_id: string
      church_id: string
      teacher_id: string
      verse_ref: string
      category: string
      items: InsightItem[]
      model: string
      prompt_version: string
      generated_at: string
    }>()

    for (const insight of result.insights) {
      const key = `${sessionId}__${sectionKey}__${insight.category}`

      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, {
          session_id: sessionId,
          church_id: churchId,
          teacher_id: user.id,
          verse_ref: sectionKey,
          category: insight.category,
          items:
  insight.category === 'word_study'
    ? filterWordStudyItems(
        dedupeInsightItems(insight.items ?? []).slice(0, 6),
        selectedWords
      )
    : dedupeInsightItems(insight.items ?? []).slice(0, 6),
          model: result.model,
          prompt_version: result.prompt_version,
          generated_at: generatedAt,
        })
        continue
      }

      existing.items = dedupeInsightItems([
        ...existing.items,
        ...(insight.items ?? []),
      ]).slice(0, 6)
    }

    const rows = Array.from(merged.values())

    const { error: upsertError } = await supabaseAdmin
      .from('verse_insights')
      .upsert(rows, { onConflict: 'session_id,verse_ref,category' })

    if (upsertError) {
      return { error: `Failed to save insights: ${upsertError.message}` }
    }

    const insightMap = Object.fromEntries(
      rows.map(row => [
        row.category,
        (row.items ?? []).map(item => ({
          title: item.title ?? '',
          content: item.content ?? '',
          source_label: item.source_label ?? undefined,
          source_url: item.source_url ?? undefined,
        })),
      ])
    ) as Record<string, {
      title: string
      content: string
      source_label?: string
      source_url?: string
    }[]>

    return {
      error: null,
      sectionKey,
      insights: insightMap,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ── savePericopeSectionsAction ────────────────────────────────────────────────
// Persists user-defined section boundaries to the session row.

export async function savePericopeSectionsAction(
  sessionId: string,
  sections: Array<{ label: string; startVerse: string }>,
): Promise<{ error: string | null }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const { error } = await supabaseAdmin
    .from('teaching_sessions')
    .update({ pericope_sections: sections } as any)
    .eq('id', sessionId)
    .eq('teacher_id', user.id)

  return { error: error?.message ?? null }
}

// ── setScriptureRefAction ─────────────────────────────────────────────────────
// Saves the scripture_ref to the session row (first time or update).

export async function setScriptureRefAction(
  sessionId: string,
  scriptureRef: string,
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const { error } = await supabaseAdmin
    .from('teaching_sessions')
    .update({ scripture_ref: scriptureRef.trim() })
    .eq('id', sessionId)
    .eq('teacher_id', user.id)

  if (error) return { error: error.message }
  return {}
}

// ── fetchPassageHeadersAction ─────────────────────────────────────────────────
// Fetches ESV section headers for a passage reference.
// Used client-side when scripture is added inline (no page reload).

export async function fetchPassageHeadersAction(
  scriptureRef: string
): Promise<{ sections: Array<{ label: string; startVerse: string }>; hasHeaders: boolean; error?: string }> {
  try {
    const { fetchPassageWithHeaders } = await import('@/lib/esv')
    const { sections } = await fetchPassageWithHeaders(scriptureRef)
    return { sections, hasHeaders: sections.length > 0 }
  } catch (err) {
    return { sections: [], hasHeaders: false, error: err instanceof Error ? err.message : 'Failed to fetch headers' }
  }
}

function filterWordStudyItems<T extends { title: string; content: string }>(
  items: T[],
  selectedWords: string[]
): T[] {
  if (!selectedWords.length) return items

  const allowed = selectedWords
    .map(w => w.trim().toLowerCase())
    .filter(Boolean)

  return items.filter(item => {
    const haystack = `${item.title} ${item.content}`.toLowerCase()
    return allowed.some(word => haystack.includes(word))
  })
}

function dedupeInsightItems(items: InsightItem[]) {
  const seen = new Set<string>()

  return items.filter(item => {
    const title = item.title.trim()
    const content = item.content.trim()
    const key = `${title}__${content}`.toLowerCase()

    if (!content || seen.has(key)) return false
    seen.add(key)

    return true
  })
}

export async function updateStudyModeAction(
  sessionId: string,
  mode: 'vbv' | 'pericope'
): Promise<void> {
  const user = await getActionUser()
  if (!user) return

  await supabaseAdmin
    .from('teaching_sessions')
    .update({ study_mode: mode })
    .eq('id', sessionId)
    .eq('teacher_id', user.id)
}

export async function splitVerseNotesAction(
  sessionId: string,
  churchId: string,
  noteIds: string[]
): Promise<{ verseNotes: Record<string, VerseNote[]>; error: string | null }> {
  const user = await getActionUser()
  if (!user) return { verseNotes: {}, error: 'Session expired.' }

  const ids = Array.from(new Set(noteIds)).filter(Boolean)
  if (!ids.length) return { verseNotes: {}, error: 'Select at least one note.' }

  const { data: notes, error: loadError } = await supabaseAdmin
    .from('verse_notes')
    .select('*')
    .eq('session_id', sessionId)
    .eq('teacher_id', user.id)
    .in('id', ids)
    .order('position')

  if (loadError) return { verseNotes: {}, error: loadError.message }
  if (!notes?.length) return { verseNotes: {}, error: 'Selected notes were not found.' }

  const byVerse = new Set(notes.map((note: VerseNote) => note.verse_ref))
  if (byVerse.size !== 1) return { verseNotes: {}, error: 'Split notes one section at a time.' }

  let cards: { sourceId: string; content: string; category: string }[] = []

  try {
    const result = await splitStudyNotes(user.id, {
      notes: notes.map((note: VerseNote) => ({ id: note.id, content: note.content }))
    })
    cards = result.cards
  } catch {
    const fallback: { sourceId: string; content: string; category: string }[] = []
    for (const note of notes) {
      const parts = note.content
        .split(/\n+|(?<=[.!?;])\s+(?=[A-Z0-9])/g)
        .map((part: string) => part.trim())
        .filter(Boolean)
      const usable = parts.length > 1 ? parts : [note.content.trim()]
      for (const part of usable) fallback.push({ sourceId: note.id, content: part, category: 'observation' })
    }
    cards = fallback
  }

  const grouped = new Map<string, string[]>()
  for (const note of notes) grouped.set(note.id, [])
  for (const card of cards) {
    const current = grouped.get(card.sourceId) ?? []
    if (!current.includes(card.content)) current.push(card.content)
    grouped.set(card.sourceId, current)
  }

  for (const note of notes) {
    const parts = grouped.get(note.id) ?? []
    if (!parts.length) parts.push(note.content.trim())

    const [first, ...rest] = parts
    await supabaseAdmin
      .from('verse_notes')
      .update({ content: first, updated_at: new Date().toISOString() })
      .eq('id', note.id)
      .eq('teacher_id', user.id)

    if (rest.length) {
      const { data: existing } = await supabaseAdmin
        .from('verse_notes')
        .select('position')
        .eq('session_id', sessionId)
        .eq('teacher_id', user.id)
        .eq('verse_ref', note.verse_ref)
        .order('position', { ascending: false })
        .limit(1)

      let nextPos = existing && existing.length > 0 ? existing[0].position + 1 : note.position + 1
      const inserts = rest.map(content => ({
        session_id: sessionId,
        church_id: churchId,
        teacher_id: user.id,
        verse_ref: note.verse_ref,
        content,
        position: nextPos++,
      }))
      const { error } = await supabaseAdmin.from('verse_notes').insert(inserts)
      if (error) return { verseNotes: {}, error: error.message }
    }
  }

  return loadVerseNotesAction(sessionId)
}
