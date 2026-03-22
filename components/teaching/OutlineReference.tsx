'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, SlidersHorizontal } from 'lucide-react'
import type { VerseNote } from '@/types/database'
import { SESSION_SHARED_INSIGHTS_KEY, formatStudyScopeLabel } from '@/lib/study-scopes'
import type { PendingItem } from './TeachingWorkspace'
import { parseWordStudyTitle } from '@/lib/word-study'

const BIBLE_BOOK_ORDER: Record<string, number> = {
  genesis:1,exodus:2,leviticus:3,numbers:4,deuteronomy:5,joshua:6,judges:7,ruth:8,
  '1samuel':9,'2samuel':10,'1kings':11,'2kings':12,'1chronicles':13,'2chronicles':14,
  ezra:15,nehemiah:16,esther:17,job:18,psalms:19,psalm:19,proverbs:20,ecclesiastes:21,
  songofsolomon:22,isaiah:23,jeremiah:24,lamentations:25,ezekiel:26,daniel:27,
  hosea:28,joel:29,amos:30,obadiah:31,jonah:32,micah:33,nahum:34,habakkuk:35,
  zephaniah:36,haggai:37,zechariah:38,malachi:39,matthew:40,mark:41,luke:42,
  john:43,acts:44,romans:45,'1corinthians':46,'2corinthians':47,galatians:48,
  ephesians:49,philippians:50,colossians:51,'1thessalonians':52,'2thessalonians':53,
  '1timothy':54,'2timothy':55,titus:56,philemon:57,hebrews:58,james:59,
  '1peter':60,'2peter':61,'1john':62,'2john':63,'3john':64,jude:65,revelation:66,
}

function canonicalSort(refs: string[]): string[] {
  return [...refs].sort((a, b) => {
    const matchA = a.match(/^(\d?\s*[A-Za-z]+)\s*(\d+):(\d+)/)
    const matchB = b.match(/^(\d?\s*[A-Za-z]+)\s*(\d+):(\d+)/)
    if (!matchA || !matchB) return a.localeCompare(b)
    const keyA = matchA[1].toLowerCase().replace(/\s/g,'')
    const keyB = matchB[1].toLowerCase().replace(/\s/g,'')
    const orderA = BIBLE_BOOK_ORDER[keyA] ?? 999
    const orderB = BIBLE_BOOK_ORDER[keyB] ?? 999
    if (orderA !== orderB) return orderA - orderB
    const chA = parseInt(matchA[2], 10), chB = parseInt(matchB[2], 10)
    if (chA !== chB) return chA - chB
    return parseInt(matchA[3], 10) - parseInt(matchB[3], 10)
  })
}

const AI_CATEGORIES = [
  { key: 'word_study',            label: 'Word Study' },
  { key: 'cross_refs',            label: 'Xref' },
  { key: 'practical',             label: 'Analogy' },
  { key: 'theology_by_tradition', label: 'Theology' },
  { key: 'context',               label: 'Context' },
  { key: 'application',           label: 'Application' },
  { key: 'quotes',                label: 'Quotes' },
] as const

type CategoryKey = typeof AI_CATEGORIES[number]['key']
type InsightItem = { title: string; content: string; is_flagged?: boolean; used_count?: number }
type Insights = Record<string, Record<string, InsightItem[]>>
type TopTab = 'notes' | 'scripture' | 'ai'

interface Props {
  verses: Array<{ verse_ref: string; text: string }>
  insights: Insights
  verseNotes: Record<string, VerseNote[]>
  hiddenVerses: Set<string>
  allVerseRefs: string[]
  onToggleVerse: (ref: string) => void
  sessionId: string
  pendingItemId: string | null
  onPendingItem: (item: PendingItem) => void
  onInsightsChange: (insights: Insights) => void
  activeTab?: TopTab
  onActiveTabChange?: (tab: TopTab) => void
  hideTopTabs?: boolean
}

export function OutlineReference({
  verses, insights, verseNotes, hiddenVerses, allVerseRefs, onToggleVerse,
  pendingItemId, onPendingItem, activeTab: controlledActiveTab, onActiveTabChange, hideTopTabs = false,
}: Props) {
  const [internalActiveTab, setInternalActiveTab] = useState<TopTab>('notes')
  const activeTab = controlledActiveTab ?? internalActiveTab
  const setActiveTab = onActiveTabChange ?? setInternalActiveTab
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('word_study')
  const [flagFilter, setFlagFilter] = useState<'all' | 'flagged' | 'unflagged'>('all')
  const [usedFilter, setUsedFilter] = useState<'all' | 'used' | 'unused'>('all')
  const [showFilter, setShowFilter] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showFilter) return
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showFilter])

  const sortedVerseRefs = useMemo(() => canonicalSort(allVerseRefs), [allVerseRefs])
  const visibleRefs = sortedVerseRefs.filter(r => !hiddenVerses.has(r))

  const notesExist = sortedVerseRefs.some(r => verseNotes[r]?.some(n => n.content.trim()))
  const aiCounts = useMemo(() => {
    const counts = Object.fromEntries(AI_CATEGORIES.map(c => [c.key, 0])) as Record<CategoryKey, number>
    for (const ref of Object.keys(insights)) {
      for (const cat of AI_CATEGORIES) counts[cat.key] += insights[ref]?.[cat.key]?.length ?? 0
    }
    return counts
  }, [insights])
  const hasAI = Object.values(aiCounts).some(Boolean)

  useEffect(() => {
    if (activeTab === 'ai' && !hasAI) {
      const fallback: TopTab = notesExist ? 'notes' : 'scripture'
      setActiveTab(fallback)
    }
  }, [activeTab, hasAI, notesExist])

  useEffect(() => {
    if (aiCounts[activeCategory] > 0) return
    const firstWithItems = AI_CATEGORIES.find(cat => aiCounts[cat.key] > 0)?.key ?? 'word_study'
    setActiveCategory(firstWithItems)
  }, [activeCategory, aiCounts])

  function queue(srcId: string, content: string, type: PendingItem['type'], kind: 'note' | 'research') {
    onPendingItem({ content, type, sourceKind: kind, sourceId: srcId })
  }

  function filterNote(n: VerseNote) {
    if (!n.content.trim()) return false
    if (flagFilter === 'flagged' && n.used_count === 0) return false
    if (flagFilter === 'unflagged' && n.used_count > 0) return false
    if (usedFilter === 'used' && n.used_count === 0) return false
    if (usedFilter === 'unused' && n.used_count > 0) return false
    return true
  }

  function filterItem(item: InsightItem) {
    if (flagFilter === 'flagged' && !item.is_flagged) return false
    if (flagFilter === 'unflagged' && item.is_flagged) return false
    if (usedFilter === 'used' && !(item.used_count ?? 0)) return false
    if (usedFilter === 'unused' && (item.used_count ?? 0) > 0) return false
    return true
  }

  const filtersActive = flagFilter !== 'all' || usedFilter !== 'all' || hiddenVerses.size > 0

  function renderItem(ref: string, catKey: CategoryKey, item: InsightItem, origIdx: number) {
    const pendKey = `${ref}-${catKey}-${origIdx}`
    const usedCnt = item.used_count ?? 0
    return (
      <div key={`${catKey}-${origIdx}`} className={`group relative border-l-2 pl-3 rounded-r-lg py-1 transition-colors ${item.is_flagged ? 'border-slate-400 bg-slate-50' : 'border-slate-100 hover:border-slate-200'}`}>
        <div className="flex items-start gap-2">
          <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
            <button
              onClick={() => {
                const type: PendingItem['type'] = catKey === 'application' ? 'application' : catKey === 'practical' ? 'illustration' : 'sub_point'
                const content = item.title ? `${item.title} — ${item.content}` : item.content
                queue(pendKey, content, type, 'research')
              }}
              className={`p-1 rounded-lg transition-all ${pendingItemId === pendKey ? 'text-violet-600 bg-violet-100' : 'text-slate-200 hover:text-slate-600 hover:bg-slate-100'}`}
              title="Place in outline"
            >
              <Plus className="w-3 h-3" />
            </button>
            {usedCnt > 0 && <span className="text-[10px] font-bold px-1 py-0.5 bg-violet-100 text-violet-500 rounded-full">{usedCnt}×</span>}
            {item.is_flagged && <span className="text-[10px] font-bold px-1 py-0.5 rounded-full bg-slate-200 text-slate-600">✓</span>}
          </div>
          <div className="flex-1 min-w-0">
            {item.title && (catKey === 'word_study' ? <WordStudyTitle title={item.title} metadataWord={(item as any).metadata?.word as string | undefined} /> : <span className="text-xs font-semibold text-slate-700 block mb-0.5">{item.title}</span>)}
            <p className="text-sm text-slate-600 leading-relaxed">{item.content}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {!hideTopTabs && <div className="flex items-center gap-1 flex-wrap">
        {([
          ['notes', 'Notes'],
          ['scripture', 'Scripture'],
          ['ai', 'AI'],
        ] as [TopTab, string][]).map(([tab, label]) => {
          const active = activeTab === tab
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
            >
              {label}
            </button>
          )
        })}

        <div ref={filterRef} className="relative shrink-0">
          <button
            onClick={() => setShowFilter(v => !v)}
            className={`flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[11px] font-medium transition-colors ${filtersActive ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
            title="Filter"
          >
            <SlidersHorizontal className="w-3 h-3" />
            {filtersActive && <span className="text-[10px]">•</span>}
          </button>

          {showFilter && (
            <div className="absolute left-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-3 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Flag</p>
                <div className="flex gap-1">
                  {(['all', 'flagged', 'unflagged'] as const).map(f => (
                    <button key={f} onClick={() => setFlagFilter(f)} className={`flex-1 py-1 rounded-lg text-[11px] font-medium transition-colors ${flagFilter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                      {f === 'all' ? 'All' : f === 'flagged' ? '✓ On' : 'Off'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Used</p>
                <div className="flex gap-1">
                  {(['all', 'used', 'unused'] as const).map(f => (
                    <button key={f} onClick={() => setUsedFilter(f)} className={`flex-1 py-1 rounded-lg text-[11px] font-medium transition-colors ${usedFilter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                      {f === 'all' ? 'All' : f === 'used' ? 'Used' : 'Unused'}
                    </button>
                  ))}
                </div>
              </div>
              {sortedVerseRefs.length > 1 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Verses</p>
                  <div className="flex flex-wrap gap-1">
                    {sortedVerseRefs.map(ref => {
                      const isVisible = !hiddenVerses.has(ref)
                      const label = ref.replace(/^.+\s/, '')
                      return (
                        <button key={ref} onClick={() => onToggleVerse(ref)} className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${isVisible ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{label}</button>
                      )
                    })}
                  </div>
                </div>
              )}
              {filtersActive && (
                <button
                  onClick={() => { setFlagFilter('all'); setUsedFilter('all'); sortedVerseRefs.forEach(r => hiddenVerses.has(r) && onToggleVerse(r)) }}
                  className="w-full py-1 text-[11px] text-slate-400 hover:text-slate-700 transition-colors"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>}

      {activeTab === 'ai' && (
        <div className="flex items-center gap-1 flex-wrap">
          {AI_CATEGORIES.map(cat => {
            const count = aiCounts[cat.key]
            const active = activeCategory === cat.key
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${active ? 'bg-slate-900 text-white' : count > 0 ? 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700' : 'bg-slate-50 text-slate-300'}`}
              >
                {cat.label}
              </button>
            )
          })}
        </div>
      )}

      <div className="space-y-4 overflow-y-auto pb-4 min-h-0">
        {activeTab === 'scripture' && (
          visibleRefs.length ? visibleRefs.map(ref => {
            const verse = verses.find(v => v.verse_ref === ref)
            if (!verse) return null
            const pendKey = `scripture:${ref}`
            return (
              <div key={`scripture-${ref}`}>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">{ref}</p>
                <div className="group flex items-start gap-1.5 rounded-lg px-1 py-1 hover:bg-slate-50">
                  <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                    <button
                      onClick={() => onPendingItem({ content: `${ref} ${verse.text}`, type: 'scripture', sourceKind: 'research', sourceId: pendKey })}
                      className={`p-1 rounded-lg transition-all ${pendingItemId === pendKey ? 'text-violet-600 bg-violet-100' : 'text-slate-200 hover:text-slate-600 hover:bg-slate-100'}`}
                      title="Place in outline"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-600 leading-relaxed">{verse.text}</p>
                  </div>
                </div>
              </div>
            )
          }) : <p className="text-sm text-slate-400">No scripture is available yet.</p>
        )}

        {activeTab === 'notes' && (
          visibleRefs.some(ref => (verseNotes[ref] ?? []).some(filterNote)) ? visibleRefs.map(ref => {
            const notes = (verseNotes[ref] ?? []).filter(filterNote)
            if (!notes.length) return null
            return (
              <div key={`notes-${ref}`}>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">{ref}</p>
                <div className="space-y-1.5">
                  {notes.map(note => (
                    <div key={note.id} className="group flex items-start gap-1.5 rounded-lg px-1 py-1 hover:bg-slate-50">
                      <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                        <button
                          onClick={() => queue(note.id, note.content, 'sub_point', 'note')}
                          className={`p-1 rounded-lg transition-all ${pendingItemId === note.id ? 'text-violet-600 bg-violet-100' : 'text-slate-200 hover:text-slate-600 hover:bg-slate-100'}`}
                          title="Place in outline"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        {note.used_count > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-violet-100 text-violet-500 rounded-full">{note.used_count}×</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-600 leading-relaxed">{note.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          }) : <p className="text-sm text-slate-400">No notes yet for this outline workspace.</p>
        )}

        {activeTab === 'ai' && (
          hasAI ? (<>
            {(() => {
              const sharedItems = (insights[SESSION_SHARED_INSIGHTS_KEY]?.[activeCategory] ?? []).filter(filterItem)
              if (!sharedItems.length) return null
              return (
                <div key={`ai-${SESSION_SHARED_INSIGHTS_KEY}`}>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">{formatStudyScopeLabel(SESSION_SHARED_INSIGHTS_KEY)}</p>
                  <div className="space-y-2">
                    {sharedItems.map((item, idx) => renderItem(SESSION_SHARED_INSIGHTS_KEY, activeCategory, item, idx))}
                  </div>
                </div>
              )
            })()}
            {visibleRefs.map(ref => {
              const allItems = insights[ref]?.[activeCategory] ?? []
              const items = allItems.filter(filterItem)
              if (!items.length) return null
              return (
                <div key={`ai-${ref}`}>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">{ref}</p>
                  <div className="space-y-2">
                    {items.map((item, idx) => renderItem(ref, activeCategory, item, idx))}
                  </div>
                </div>
              )
            })}
          </>) : <p className="text-sm text-slate-400">No AI research yet for this passage.</p>
        )}
      </div>
    </div>
  )
}

function WordStudyTitle({ title, metadataWord }: { title: string; metadataWord?: string }) {
  const parsed = parseWordStudyTitle(title, metadataWord)
  if (!parsed.original) return <span className="text-xs font-semibold text-slate-700 block mb-0.5">{parsed.fallbackTitle}</span>
  return (
    <span className="flex flex-wrap items-baseline gap-1.5 mb-0.5">
      {parsed.english && <span className="text-xs font-semibold text-slate-700">{parsed.english}</span>}
      {parsed.english && <span className="text-xs text-slate-400">|</span>}
      <span className="text-sm font-bold text-slate-800">{parsed.original}</span>
      {parsed.transliteration && <span className="text-xs text-slate-500 italic">{parsed.transliteration}</span>}
    </span>
  )
}
