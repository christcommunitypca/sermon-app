'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AlertCircle, ArrowUpRight, Check, Lightbulb, Network, History, Church, BookText, Quote, ScrollText, RefreshCw, Settings, Pin, PinOff, X } from 'lucide-react'
import { generateResearchAction } from '@/app/actions/ai'
import { dismissResearchItemAction, pinResearchItemAction, pushResearchToOutlineAction } from '@/app/(app)/[churchSlug]/teaching/[sessionId]/research-actions'
import { SESSION_SHARED_INSIGHTS_KEY } from '@/lib/study-scopes'
import {
  formatUnifiedStudyCategoryLabel,
  getOutlinePushContentFromUnifiedStudy,
  inferOutlineBlockTypeFromUnifiedStudy,
  mapResearchCategoryToUnifiedCategories,
  mapResearchItemsToUnifiedStudyItems,
  mapUnifiedCategoryToResearchCategory,
  type UnifiedStudyItem,
  UNIFIED_STUDY_TABS,
} from '@/lib/study-unified'

const TAB_ICONS: Record<string, typeof BookText> = {
  word_study: BookText,
  cross_refs: Network,
  context: History,
  theology_by_tradition: Church,
  application: Lightbulb,
  practical: Lightbulb,
  quotes: Quote,
  scripture: ScrollText,
}

interface Props {
  sessionId: string
  churchId: string
  churchSlug: string
  scriptureRef: string | null
  sessionTitle: string
  hasValidAIKey: boolean
  initialItems: UnifiedStudyItem[]
}

export function ResearchWorkspace({
  sessionId,
  churchId,
  churchSlug,
  scriptureRef,
  sessionTitle,
  hasValidAIKey,
  initialItems,
}: Props) {
  const [items, setItems] = useState<UnifiedStudyItem[]>(initialItems)
  const availableCategories = useMemo(() => {
    const fromItems = Array.from(new Set(items.map(item => item.category)))
    const preferred = UNIFIED_STUDY_TABS.map(tab => tab.category)
    return Array.from(new Set([...preferred, ...fromItems]))
  }, [items])

  const [activeTab, setActiveTab] = useState<string>(initialItems[0]?.category ?? 'word_study')
  const [activeScope, setActiveScope] = useState<'all' | string>('all')
  const [generating, setGenerating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [workingItemId, setWorkingItemId] = useState<string | null>(null)
  const [pushedItemId, setPushedItemId] = useState<string | null>(null)

  const scopeOptions = useMemo(() => {
    const allScopes = Array.from(new Map(items.map(item => [item.scopeRef, item.scopeLabel])).entries())
      .map(([scopeRef, scopeLabel]) => ({ scopeRef, scopeLabel }))
      .sort((a, b) => {
        if (a.scopeRef === SESSION_SHARED_INSIGHTS_KEY) return -1
        if (b.scopeRef === SESSION_SHARED_INSIGHTS_KEY) return 1
        return a.scopeLabel.localeCompare(b.scopeLabel)
      })
    return [{ scopeRef: 'all', scopeLabel: 'All scopes' }, ...allScopes]
  }, [items])

  const currentTabMeta = UNIFIED_STUDY_TABS.find(tab => tab.category === activeTab)
  const categoryCounts = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + 1
      return acc
    }, {})
  }, [items])

  const tabItems = useMemo(() => {
    return items
      .filter(item => item.category === activeTab)
      .filter(item => activeScope === 'all' ? true : item.scopeRef === activeScope)
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1
        if (!a.isPinned && b.isPinned) return 1
        if (a.scopeRef === SESSION_SHARED_INSIGHTS_KEY && b.scopeRef !== SESSION_SHARED_INSIGHTS_KEY) return -1
        if (a.scopeRef !== SESSION_SHARED_INSIGHTS_KEY && b.scopeRef === SESSION_SHARED_INSIGHTS_KEY) return 1
        return (b.usedCount ?? 0) - (a.usedCount ?? 0)
      })
  }, [items, activeTab, activeScope])

  const researchCategory = mapUnifiedCategoryToResearchCategory(activeTab)
  const canGenerate = !!researchCategory && !!scriptureRef
  const isGeneratingThis = generating === activeTab

  async function handleGenerate(replace = false) {
    if (!researchCategory || !hasValidAIKey || generating !== null) return
    setGenerating(activeTab)
    setError(null)

    try {
      const data = await generateResearchAction({
        sessionId,
        churchId,
        category: researchCategory,
        replaceExisting: replace,
      })

      if (data.error || !data.items) {
        setError(data.error ?? 'Generation failed. Try again.')
        return
      }

      const unifiedNewItems = mapResearchItemsToUnifiedStudyItems(data.items)
      const affectedCategories = mapResearchCategoryToUnifiedCategories(researchCategory)

      setItems(prev => {
        const cleaned = replace
          ? prev.filter(item => !(item.scopeRef === SESSION_SHARED_INSIGHTS_KEY && affectedCategories.includes(item.category) && item.sourceResearchId))
          : prev
        const withoutDuplicates = cleaned.filter(existing => !unifiedNewItems.some(next => next.id === existing.id))
        return [...withoutDuplicates, ...unifiedNewItems]
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed. Try again.')
    } finally {
      setGenerating(null)
    }
  }

  async function handlePin(item: UnifiedStudyItem) {
    if (!item.rowVerseRef || !item.rowCategory || typeof item.rowItemIndex !== 'number') return
    setWorkingItemId(item.id)
    const result = await pinResearchItemAction({
      sessionId,
      verseRef: item.rowVerseRef,
      category: item.rowCategory,
      itemIndex: item.rowItemIndex,
      isPinned: !item.isPinned,
      sourceResearchId: item.sourceResearchId,
    })

    if (!result.error) {
      setItems(prev => prev.map(entry =>
        entry.id === item.id ? { ...entry, isPinned: !item.isPinned } : entry
      ))
    } else {
      setError(result.error)
    }
    setWorkingItemId(null)
  }

  async function handleDismiss(item: UnifiedStudyItem) {
    if (!item.rowVerseRef || !item.rowCategory || typeof item.rowItemIndex !== 'number') return
    setWorkingItemId(item.id)
    const result = await dismissResearchItemAction({
      sessionId,
      verseRef: item.rowVerseRef,
      category: item.rowCategory,
      itemIndex: item.rowItemIndex,
      sourceResearchId: item.sourceResearchId,
    })

    if (!result.error) {
      setItems(prev => prev.filter(entry => entry.id !== item.id))
    } else {
      setError(result.error)
    }
    setWorkingItemId(null)
  }

  async function handlePush(item: UnifiedStudyItem) {
    setWorkingItemId(item.id)
    const result = await pushResearchToOutlineAction({
      sessionId,
      churchId,
      churchSlug,
      content: getOutlinePushContentFromUnifiedStudy(item),
      blockType: inferOutlineBlockTypeFromUnifiedStudy(item),
      verseRef: item.rowVerseRef,
      category: item.rowCategory,
      itemIndex: item.rowItemIndex,
      sourceResearchId: item.sourceResearchId,
    })

    setWorkingItemId(null)
    if (!result.error) {
      setItems(prev => prev.map(entry =>
        entry.id === item.id ? { ...entry, usedCount: (entry.usedCount ?? 0) + 1 } : entry
      ))
      setPushedItemId(item.id)
      setTimeout(() => setPushedItemId(current => (current === item.id ? null : current)), 2500)
    } else {
      setError(result.error)
    }
  }

  if (!scriptureRef) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="w-8 h-8 text-slate-300 mb-3" />
        <h3 className="text-sm font-semibold text-slate-700 mb-1">No scripture reference</h3>
        <p className="text-sm text-slate-400 max-w-sm mb-4">
          Add a scripture reference to this session to use the study workspace.
        </p>
        <Link
          href={`/${churchSlug}/teaching/${sessionId}/edit`}
          className="text-sm text-violet-600 hover:text-violet-800 underline"
        >
          Edit session to add scripture
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <p className="text-xs text-slate-400 mb-0.5">Unified study view</p>
          <p className="text-sm font-semibold text-slate-900">{scriptureRef}</p>
          <p className="text-xs text-slate-400 mt-0.5">{sessionTitle}</p>
        </div>
        {!hasValidAIKey && (
          <Link
            href={`/${churchSlug}/settings/ai`}
            className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg whitespace-nowrap"
          >
            <Settings className="w-3 h-3" />
            Add AI key
          </Link>
        )}
      </div>

      <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
        This page now shows the same study material used in verse-by-verse and pericope study, filtered by category and scope.
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-3 -mx-1 px-1 scrollbar-none">
        {availableCategories.map(category => {
          const label = formatUnifiedStudyCategoryLabel(category)
          const Icon = TAB_ICONS[category] ?? BookText
          const count = categoryCounts[category] ?? 0
          const isActive = activeTab === category
          return (
            <button
              key={category}
              onClick={() => { setActiveTab(category); setError(null) }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {!!count && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-400'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {scopeOptions.map(scope => {
          const isActive = activeScope === scope.scopeRef
          return (
            <button
              key={scope.scopeRef}
              onClick={() => setActiveScope(scope.scopeRef as 'all' | string)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                isActive
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {scope.scopeLabel}
            </button>
          )
        })}
      </div>

      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{currentTabMeta?.label ?? formatUnifiedStudyCategoryLabel(activeTab)}</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {currentTabMeta?.description ?? 'Study material filtered from the shared session content.'}
          </p>
        </div>

        {canGenerate ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleGenerate(false)}
              disabled={!hasValidAIKey || isGeneratingThis}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingThis ? 'animate-spin' : ''}`} />
              Generate
            </button>
            <button
              onClick={() => handleGenerate(true)}
              disabled={!hasValidAIKey || isGeneratingThis}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              Replace
            </button>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 max-w-[220px] text-right">
            This category is read-only here. Generate it from verse-by-verse or pericope study.
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {tabItems.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/60">
          <p className="text-sm font-medium text-slate-700 mb-1">No items in this view yet</p>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            {canGenerate
              ? 'Generate AI study content for this category, or switch scope to see material already attached elsewhere in the passage.'
              : 'Try another category or scope to see material already attached to this session.'}
          </p>
          {canGenerate && (
            <button
              onClick={() => handleGenerate(false)}
              disabled={!hasValidAIKey || isGeneratingThis}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isGeneratingThis ? 'animate-spin' : ''}`} />
              Generate {currentTabMeta?.label ?? formatUnifiedStudyCategoryLabel(activeTab)}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {tabItems.map(item => {
            const working = workingItemId === item.id
            const canMutateResearch = !!item.rowVerseRef && !!item.rowCategory && typeof item.rowItemIndex === 'number'
            return (
              <div key={item.id} className={`group relative bg-white border rounded-xl p-4 transition-all ${item.isPinned ? 'border-violet-200 bg-violet-50/30' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {item.scopeLabel}
                      </span>
                      {item.sourceLabel && (
                        <span className="text-[11px] text-slate-400">{item.sourceLabel}</span>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-slate-900 leading-snug">{item.title}</h4>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    {canMutateResearch && (
                      <>
                        <button
                          onClick={() => handlePin(item)}
                          disabled={working}
                          className={`p-1.5 rounded transition-colors ${item.isPinned ? 'text-violet-600 hover:text-violet-800' : 'text-slate-300 hover:text-slate-600'}`}
                          title={item.isPinned ? 'Unpin' : 'Pin'}
                        >
                          {item.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDismiss(item)}
                          disabled={working}
                          className="p-1.5 text-slate-300 hover:text-red-500 rounded transition-colors"
                          title="Dismiss"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap mb-3">{item.content}</p>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>{formatUnifiedStudyCategoryLabel(item.category)}</span>
                    {(item.usedCount ?? 0) > 0 && <span>Used {item.usedCount}×</span>}
                  </div>

                  <button
                    onClick={() => handlePush(item)}
                    disabled={working}
                    className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors min-h-[32px] ${
                      pushedItemId === item.id
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    {pushedItemId === item.id ? (
                      <><Check className="w-3 h-3" />Added to outline</>
                    ) : working ? (
                      <span className="text-slate-400">Working…</span>
                    ) : (
                      <><ArrowUpRight className="w-3 h-3" />Add to outline</>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
