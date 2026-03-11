'use server'

import { getActionUser } from '@/lib/supabase/auth-context'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { fetchPassage, type VerseData } from '@/lib/esv'
import {
  generateVerseInsights,
  generateLessonSummary,
  buildCopyablePrompt,
  AIError,
} from '@/lib/ai/service'
import { getUserTradition } from '@/lib/research'
import { getFlatRenderOrder } from '@/lib/outline'
import type { OutlineBlock, VerseNote } from '@/types/database'

// ── fetchVerseDataAction ───────────────────────────────────────────────────────
// Returns cached ESV text + saved insights + all verse notes.
// Called on page load and after AI generation.

export async function fetchVerseDataAction(
  sessionId: string,
  scriptureRef: string
): Promise<{
  verses: VerseData[] | null
  insights: Record<string, Record<string, { title: string; content: string }[]>>
  verseNotes: Record<string, VerseNote[]>
  error: string | null
}> {
  const user = await getActionUser()
  if (!user) return { verses: null, insights: {}, verseNotes: {}, error: 'Session expired — please refresh.' }

  try {
    const verses = await fetchPassage(scriptureRef)

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

    const insights: Record<string, Record<string, { title: string; content: string }[]>> = {}
    for (const row of insightRows ?? []) {
      if (!insights[row.verse_ref]) insights[row.verse_ref] = {}
      insights[row.verse_ref][row.category] = row.items as { title: string; content: string }[]
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
  const failed = results.find(r => r.error)
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
  selectedWords?: Record<string, string[]>   // verse_ref → words chosen by teacher
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
      verses,
      sessionTitle: session.title,
      sessionType: session.type,
      tradition,
      pastorNotes: notesContext,
      selectedWords: selectedWords ?? {},
    })

    // Save ALL rows before returning — never show without persisting
    const rows = result.insights.map(insight => ({
      session_id: sessionId,
      church_id: churchId,
      teacher_id: user.id,
      verse_ref: insight.verse_ref,
      category: insight.category,
      items: insight.items,
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

// ── updateTeachingModeAction ───────────────────────────────────────────────────

export async function updateTeachingModeAction(
  sessionId: string,
  mode: 'verse_by_verse' | 'outline'
): Promise<void> {
  const user = await getActionUser()
  if (!user) return

  await supabaseAdmin
    .from('teaching_sessions')
    .update({ teaching_mode: mode })
    .eq('id', sessionId)
    .eq('teacher_id', user.id)
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
