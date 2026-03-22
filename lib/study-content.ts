import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ResearchItem } from '@/types/database'
import { SESSION_SHARED_INSIGHTS_KEY } from '@/lib/study-scopes'
import type { UnifiedStudyItem } from '@/lib/study-unified'
import { formatStudyScopeLabel } from '@/lib/study-scopes'

type SharedInsightItem = {
  title: string
  content: string
  source_label?: string
  source_url?: string
  is_flagged?: boolean
  used_count?: number
  source_research_id?: string
  is_pinned?: boolean
  metadata?: Record<string, unknown>
}

function mapResearchItemToInsightEntries(item: ResearchItem): Array<{ category: string; item: SharedInsightItem }> {
  const baseItem: SharedInsightItem = {
    title: item.title ?? '',
    content: item.content ?? '',
    source_label: item.source_label ?? undefined,
    is_flagged: false,
    used_count: item.used_count ?? 0,
    source_research_id: item.id,
    is_pinned: item.is_pinned,
    metadata: (item.metadata ?? {}) as Record<string, unknown>,
  }

  switch (item.category) {
    case 'word_study':
      return [{ category: 'word_study', item: baseItem }]
    case 'related_text':
      return [{ category: 'cross_refs', item: baseItem }]
    case 'historical':
      return [{ category: 'context', item: baseItem }]
    case 'theological':
      return [{ category: 'theology_by_tradition', item: baseItem }]
    case 'practical':
      return [{
        category: item.subcategory === 'application' ? 'application' : 'practical',
        item: baseItem,
      }]
    default:
      return []
  }
}

export async function rebuildSharedStudyInsightsFromResearch(args: {
  sessionId: string
  churchId: string
  teacherId: string
}) {
  const { sessionId, churchId, teacherId } = args

  const { data: researchItems } = await supabaseAdmin
    .from('research_items')
    .select('*')
    .eq('session_id', sessionId)
    .eq('teacher_id', teacherId)
    .eq('is_dismissed', false)
    .order('is_pinned', { ascending: false })
    .order('position')
    .order('created_at')

  await supabaseAdmin
    .from('verse_insights')
    .delete()
    .eq('session_id', sessionId)
    .eq('teacher_id', teacherId)
    .eq('verse_ref', SESSION_SHARED_INSIGHTS_KEY)

  if (!researchItems?.length) return

  const grouped: Record<string, SharedInsightItem[]> = {}

  for (const item of researchItems as ResearchItem[]) {
    for (const mapped of mapResearchItemToInsightEntries(item)) {
      if (!grouped[mapped.category]) grouped[mapped.category] = []
      grouped[mapped.category].push(mapped.item)
    }
  }

  const rows = Object.entries(grouped).map(([category, items]) => ({
    session_id: sessionId,
    church_id: churchId,
    teacher_id: teacherId,
    verse_ref: SESSION_SHARED_INSIGHTS_KEY,
    category,
    items,
    model: 'mirrored:research_items',
    prompt_version: 'phase2-shared-v1',
    generated_at: new Date().toISOString(),
  }))

  if (!rows.length) return

  const { error } = await supabaseAdmin
    .from('verse_insights')
    .upsert(rows, { onConflict: 'session_id,verse_ref,category' })

  if (error) throw new Error(error.message)
}

export async function ensureSharedStudyInsightsFromResearch(args: {
  sessionId: string
  churchId: string
  teacherId: string
}) {
  const { sessionId, churchId, teacherId } = args

  const [{ count: sharedCount }, { count: researchCount }] = await Promise.all([
    supabaseAdmin
      .from('verse_insights')
      .select('*', { head: true, count: 'exact' })
      .eq('session_id', sessionId)
      .eq('teacher_id', teacherId)
      .eq('verse_ref', SESSION_SHARED_INSIGHTS_KEY),
    supabaseAdmin
      .from('research_items')
      .select('*', { head: true, count: 'exact' })
      .eq('session_id', sessionId)
      .eq('teacher_id', teacherId)
      .eq('is_dismissed', false),
  ])

  if (!researchCount) return
  if (sharedCount) return

  await rebuildSharedStudyInsightsFromResearch({ sessionId, churchId, teacherId })
}

export async function getUnifiedStudyItemsForSession(args: {
  sessionId: string
  teacherId: string
}) {
  const { sessionId, teacherId } = args

  const { data: insightRows } = await supabaseAdmin
    .from('verse_insights')
    .select('verse_ref, category, items, generated_at')
    .eq('session_id', sessionId)
    .eq('teacher_id', teacherId)

  const unified: UnifiedStudyItem[] = []

  for (const row of insightRows ?? []) {
    const items = Array.isArray(row.items) ? row.items : []
    const scopeRef = row.verse_ref as string
    const scopeLabel = formatStudyScopeLabel(scopeRef)

    items.forEach((item, index) => {
      const entry = (item ?? {}) as Record<string, unknown>
      unified.push({
        id: `${scopeRef}:${row.category}:${String(entry.source_research_id ?? index)}`,
        scopeRef,
        scopeLabel,
        category: row.category,
        title: typeof entry.title === 'string' ? entry.title : '',
        content: typeof entry.content === 'string' ? entry.content : '',
        sourceLabel: typeof entry.source_label === 'string' ? entry.source_label : undefined,
        sourceUrl: typeof entry.source_url === 'string' ? entry.source_url : undefined,
        isFlagged: entry.is_flagged === true,
        usedCount: typeof entry.used_count === 'number' ? entry.used_count : 0,
        sourceResearchId: typeof entry.source_research_id === 'string' ? entry.source_research_id : undefined,
        isPinned: entry.is_pinned === true,
        metadata: typeof entry.metadata === 'object' && entry.metadata && !Array.isArray(entry.metadata)
          ? (entry.metadata as Record<string, unknown>)
          : undefined,
        rowVerseRef: scopeRef,
        rowCategory: row.category,
        rowItemIndex: index,
      })
    })
  }

  return unified
}

async function readInsightItems(args: {
  sessionId: string
  teacherId: string
  verseRef: string
  category: string
}) {
  const { sessionId, teacherId, verseRef, category } = args
  const { data, error } = await supabaseAdmin
    .from('verse_insights')
    .select('items')
    .eq('session_id', sessionId)
    .eq('teacher_id', teacherId)
    .eq('verse_ref', verseRef)
    .eq('category', category)
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Insight row not found')
  return Array.isArray(data.items) ? (data.items as SharedInsightItem[]) : []
}

async function writeInsightItems(args: {
  sessionId: string
  teacherId: string
  verseRef: string
  category: string
  items: SharedInsightItem[]
}) {
  const { sessionId, teacherId, verseRef, category, items } = args

  if (items.length === 0) {
    const { error } = await supabaseAdmin
      .from('verse_insights')
      .delete()
      .eq('session_id', sessionId)
      .eq('teacher_id', teacherId)
      .eq('verse_ref', verseRef)
      .eq('category', category)
    if (error) throw new Error(error.message)
    return
  }

  const { error } = await supabaseAdmin
    .from('verse_insights')
    .update({ items, generated_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('teacher_id', teacherId)
    .eq('verse_ref', verseRef)
    .eq('category', category)

  if (error) throw new Error(error.message)
}

function resolveIndex(items: SharedInsightItem[], itemIndex: number, sourceResearchId?: string | null) {
  if (items[itemIndex]) return itemIndex
  if (sourceResearchId) {
    const found = items.findIndex(item => item.source_research_id === sourceResearchId)
    if (found >= 0) return found
  }
  return -1
}

export async function setUnifiedStudyItemPinned(args: {
  sessionId: string
  teacherId: string
  verseRef: string
  category: string
  itemIndex: number
  isPinned: boolean
  sourceResearchId?: string | null
}) {
  const { sessionId, teacherId, verseRef, category, itemIndex, isPinned, sourceResearchId } = args
  const items = await readInsightItems({ sessionId, teacherId, verseRef, category })
  const resolvedIndex = resolveIndex(items, itemIndex, sourceResearchId)
  if (resolvedIndex < 0) throw new Error('Insight item not found')

  items[resolvedIndex] = { ...items[resolvedIndex], is_pinned: isPinned }
  await writeInsightItems({ sessionId, teacherId, verseRef, category, items })

  if (sourceResearchId) {
    await supabaseAdmin
      .from('research_items')
      .update({ is_pinned: isPinned })
      .eq('id', sourceResearchId)
      .eq('teacher_id', teacherId)
  }
}

export async function dismissUnifiedStudyItem(args: {
  sessionId: string
  teacherId: string
  verseRef: string
  category: string
  itemIndex: number
  sourceResearchId?: string | null
}) {
  const { sessionId, teacherId, verseRef, category, itemIndex, sourceResearchId } = args
  const items = await readInsightItems({ sessionId, teacherId, verseRef, category })
  const resolvedIndex = resolveIndex(items, itemIndex, sourceResearchId)
  if (resolvedIndex < 0) throw new Error('Insight item not found')

  items.splice(resolvedIndex, 1)
  await writeInsightItems({ sessionId, teacherId, verseRef, category, items })

  if (sourceResearchId) {
    await supabaseAdmin
      .from('research_items')
      .update({ is_dismissed: true })
      .eq('id', sourceResearchId)
      .eq('teacher_id', teacherId)
  }
}

export async function incrementUnifiedStudyItemUsedCount(args: {
  sessionId: string
  teacherId: string
  verseRef: string
  category: string
  itemIndex: number
  sourceResearchId?: string | null
}) {
  const { sessionId, teacherId, verseRef, category, itemIndex, sourceResearchId } = args
  const items = await readInsightItems({ sessionId, teacherId, verseRef, category })
  const resolvedIndex = resolveIndex(items, itemIndex, sourceResearchId)
  if (resolvedIndex < 0) throw new Error('Insight item not found')

  const current = items[resolvedIndex]?.used_count ?? 0
  items[resolvedIndex] = { ...items[resolvedIndex], used_count: current + 1 }
  await writeInsightItems({ sessionId, teacherId, verseRef, category, items })

  if (sourceResearchId) {
    await supabaseAdmin.rpc('increment_research_used_count', { item_id: sourceResearchId })
  }
}
