import type { BlockType, ResearchCategory, ResearchItem } from '@/types/database'
import { SESSION_SHARED_INSIGHTS_KEY, formatStudyScopeLabel } from '@/lib/study-scopes'
import { getPreferredWordStudyPushLabel } from '@/lib/word-study'

export type UnifiedStudyCategory =
  | 'word_study'
  | 'cross_refs'
  | 'context'
  | 'theology_by_tradition'
  | 'application'
  | 'practical'
  | 'quotes'
  | 'scripture'

export interface UnifiedStudyItem {
  id: string
  scopeRef: string
  scopeLabel: string
  category: string
  title: string
  content: string
  sourceLabel?: string
  sourceUrl?: string
  isFlagged?: boolean
  usedCount?: number
  sourceResearchId?: string
  isPinned?: boolean
  metadata?: Record<string, unknown>
  rowVerseRef?: string
  rowCategory?: string
  rowItemIndex?: number
}

export const UNIFIED_STUDY_TABS: Array<{ category: UnifiedStudyCategory; label: string; description: string }> = [
  { category: 'word_study', label: 'Words', description: 'Key words and original-language observations' },
  { category: 'cross_refs', label: 'Cross-refs', description: 'Related passages that illuminate the text' },
  { category: 'context', label: 'Context', description: 'Historical, literary, and cultural background' },
  { category: 'theology_by_tradition', label: 'Theology', description: 'Theological insights and tradition-aware framing' },
  { category: 'application', label: 'Application', description: 'How this text presses into life and obedience' },
  { category: 'practical', label: 'Practical', description: 'Illustrations, analogies, and preaching helps' },
  { category: 'quotes', label: 'Quotes', description: 'Quotations and supporting references' },
  { category: 'scripture', label: 'Scripture', description: 'Scripture observations and textual hooks' },
]

export function formatUnifiedStudyCategoryLabel(category: string) {
  return UNIFIED_STUDY_TABS.find(tab => tab.category === category)?.label
    ?? category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function mapResearchCategoryToUnifiedCategories(category: ResearchCategory): string[] {
  switch (category) {
    case 'word_study':
      return ['word_study']
    case 'related_text':
      return ['cross_refs']
    case 'historical':
      return ['context']
    case 'theological':
      return ['theology_by_tradition']
    case 'practical':
      return ['application', 'practical']
    default:
      return []
  }
}

export function mapUnifiedCategoryToResearchCategory(category: string): ResearchCategory | null {
  switch (category) {
    case 'word_study':
      return 'word_study'
    case 'cross_refs':
      return 'related_text'
    case 'context':
      return 'historical'
    case 'theology_by_tradition':
      return 'theological'
    case 'application':
    case 'practical':
      return 'practical'
    default:
      return null
  }
}

export function inferOutlineBlockTypeFromUnifiedStudy(item: UnifiedStudyItem): BlockType {
  const meta = item.metadata ?? {}
  const suggested = meta?.suggested_block_type
  if (typeof suggested === 'string') return suggested as BlockType

  const subcategory = typeof meta?.subcategory === 'string' ? meta.subcategory : null
  switch (item.category) {
    case 'cross_refs':
    case 'scripture':
      return 'scripture'
    case 'application':
      return 'application'
    case 'practical':
      return subcategory === 'analogy' ? 'illustration' : 'point'
    default:
      return 'point'
  }
}

export function getOutlinePushContentFromUnifiedStudy(item: UnifiedStudyItem): string {
  const meta = item.metadata ?? {}

  if (item.category === 'cross_refs' || item.category === 'scripture') {
    const ref = meta?.ref
    return typeof ref === 'string' && ref.trim() ? ref : item.title || item.content
  }

  if (item.category === 'word_study') {
    return getPreferredWordStudyPushLabel(item.title || item.content, (item.metadata?.word as string | undefined) ?? undefined)
  }

  if (item.category === 'theology_by_tradition') {
    return item.title || item.content
  }

  return item.content || item.title
}

function mapResearchItemToUnifiedItems(item: ResearchItem): UnifiedStudyItem[] {
  const base = {
    title: item.title ?? '',
    content: item.content ?? '',
    sourceLabel: item.source_label ?? undefined,
    sourceUrl: undefined,
    isFlagged: false,
    usedCount: item.used_count ?? 0,
    sourceResearchId: item.id,
    isPinned: item.is_pinned,
    metadata: (item.metadata ?? {}) as Record<string, unknown>,
    scopeRef: SESSION_SHARED_INSIGHTS_KEY,
    scopeLabel: formatStudyScopeLabel(SESSION_SHARED_INSIGHTS_KEY),
  }

  switch (item.category) {
    case 'word_study':
      return [{ id: `research:${item.id}:word_study`, category: 'word_study', ...base }]
    case 'related_text':
      return [{ id: `research:${item.id}:cross_refs`, category: 'cross_refs', ...base }]
    case 'historical':
      return [{ id: `research:${item.id}:context`, category: 'context', ...base }]
    case 'theological':
      return [{ id: `research:${item.id}:theology_by_tradition`, category: 'theology_by_tradition', ...base }]
    case 'practical': {
      const mappedCategory = item.subcategory === 'application' ? 'application' : 'practical'
      return [{ id: `research:${item.id}:${mappedCategory}`, category: mappedCategory, ...base }]
    }
    default:
      return []
  }
}

export function mapResearchItemsToUnifiedStudyItems(items: ResearchItem[]) {
  return items.flatMap(mapResearchItemToUnifiedItems)
}
