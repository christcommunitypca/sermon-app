'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, SlidersHorizontal } from 'lucide-react'
import type { VerseNote } from '@/types/database'
import type { PendingItem } from './TeachingWorkspace'

const BIBLE_BOOK_ORDER: Record<string, number> = {
  genesis:1,exodus:2,leviticus:3,numbers:4,deuteronomy:5,joshua:6,judges:7,ruth:8,
  '1samuel':9,'2samuel':10,'1kings':11,'2kings':12,'1chronicles':13,'2chronicles':14,
  ezra:15,nehemiah:16,esther:17,job:18,psalms:19,psalm:19,proverbs:20,ecclesiastes:21,
  'songofsolomon':22,'songofsongsofsolomon':22,isaiah:23,jeremiah:24,lamentations:25,
  ezekiel:26,daniel:27,hosea:28,joel:29,amos:30,obadiah:31,jonah:32,micah:33,nahum:34,
  habakkuk:35,zephaniah:36,haggai:37,zechariah:38,malachi:39,
  matthew:40,mark:41,luke:42,john:43,acts:44,romans:45,
  '1corinthians':46,'2corinthians':47,galatians:48,ephesians:49,philippians:50,
  colossians:51,'1thessalonians':52,'2thessalonians':53,'1timothy':54,'2timothy':55,
  titus:56,philemon:57,hebrews:58,james:59,'1peter':60,'2peter':61,
  '1john':62,'2john':63,'3john':64,jude:65,revelation:66,
}

function canonicalSort(refs: string[]): string[] {
  return [...refs].sort((a, b) => {
    const bookA = a.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\d.*$/, m => m)
    const bookB = b.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\d.*$/, m => m)
    // Extract book name and chapter:verse
    const matchA = a.match(/^(\d?\s*[A-Za-z]+)\s*(\d+):(\d+)/)
    const matchB = b.match(/^(\d?\s*[A-Za-z]+)\s*(\d+):(\d+)/)
    if (!matchA || !matchB) return a.localeCompare(b)
    const keyA = matchA[1].toLowerCase().replace(/\s/g,'')
    const keyB = matchB[1].toLowerCase().replace(/\s/g,'')
    const orderA = BIBLE_BOOK_ORDER[keyA] ?? 999
    const orderB = BIBLE_BOOK_ORDER[keyB] ?? 999
    if (orderA !== orderB) return orderA - orderB
    const chA = parseInt(matchA[2]), chB = parseInt(matchB[2])
    if (chA !== chB) return chA - chB
    return parseInt(matchA[3]) - parseInt(matchB[3])
  })
}

const CATEGORIES = [
  { key: 'word_study',            label: 'Word Study'  },
  { key: 'cross_refs',            label: 'Cross-refs'  },
  { key: 'practical',             label: 'Analogies'   },
  { key: 'theology_by_tradition', label: 'Tradition'   },
  { key: 'context',               label: 'Context'     },
  { key: 'application',           label: 'Application' },
] as const

type CategoryKey = typeof CATEGORIES[number]['key']
type InsightItem = { title: string; content: string; is_flagged?: boolean; used_count?: number }
type Insights    = Record<string, Record<string, InsightItem[]>>

interface Props {
  insights:         Insights
  verseNotes:       Record<string, VerseNote[]>
  hiddenVerses:     Set<string>
  allVerseRefs:     string[]
  onToggleVerse:    (ref: string) => void
  sessionId:        string
  pendingItemId:    string | null
  onPendingItem:    (item: PendingItem) => void
  onInsightsChange: (insights: Insights) => void
}

export function OutlineReference({
  insights, verseNotes, hiddenVerses, allVerseRefs, onToggleVerse, sessionId,
  pendingItemId, onPendingItem, onInsightsChange,
}: Props) {
  const [activeTab,   setActiveTab]   = useState<CategoryKey | 'notes'>('notes')
  const [flagFilter,  setFlagFilter]  = useState<'all' | 'flagged' | 'unflagged'>('all')
  const [usedFilter,  setUsedFilter]  = useState<'all' | 'used' | 'unused'>('all')
  const [showFilter,  setShowFilter]  = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  // Close popover on outside click
  useEffect(() => {
    if (!showFilter) return
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showFilter])

  const sortedVerseRefs = canonicalSort(allVerseRefs)
  const hasNotes    = sortedVerseRefs.some(r => verseNotes[r]?.some(n => n.content.trim()))
  const hasInsights = Object.keys(insights).length > 0

  if (!hasNotes && !hasInsights) {
    return (
      <div className="px-4 py-8 text-center text-xs text-slate-300">
        Add notes and generate research in the Verse by Verse view
      </div>
    )
  }

  const visibleRefs = sortedVerseRefs.filter(r => !hiddenVerses.has(r))

  function queue(srcId: string, content: string, type: PendingItem['type'], kind: 'note' | 'research') {
    onPendingItem({ content, type, sourceKind: kind, sourceId: srcId })
  }

  const visibleTabs: (CategoryKey | 'notes')[] = []
  if (hasNotes) visibleTabs.push('notes')
  for (const cat of CATEGORIES) {
    if (Object.values(insights).some(cats => (cats[cat.key]?.length ?? 0) > 0)) visibleTabs.push(cat.key)
  }
  const effectiveTab = visibleTabs.includes(activeTab) ? activeTab : (visibleTabs[0] ?? 'notes')

  function usedCount(tab: CategoryKey | 'notes') {
    if (tab === 'notes') return Object.values(verseNotes).flat().filter(n => n.used_count > 0).length
    let n = 0
    for (const cats of Object.values(insights)) {
      for (const item of cats[tab] ?? []) { if ((item.used_count ?? 0) > 0) n++ }
    }
    return n
  }

  const filtersActive = flagFilter !== 'all' || usedFilter !== 'all' || hiddenVerses.size > 0

  return (
    <div className="flex flex-col gap-2 min-h-0">

      {/* ── Tabs + filter icon on one row ──────────────────────────────────── */}
      <div className="flex items-center gap-1 flex-wrap">
        {visibleTabs.map(tab => {
          const cat      = CATEGORIES.find(c => c.key === tab)
          const isActive = tab === effectiveTab
          const used     = usedCount(tab)
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
              }`}
            >
              {tab === 'notes' ? 'Notes' : cat?.label}
              {used > 0 && (
                <span className={`ml-1 text-[10px] font-bold ${isActive ? 'opacity-60' : 'opacity-50'}`}>
                  {used}
                </span>
              )}
            </button>
          )
        })}

        {/* Filter popover trigger — same row, far right */}
        <div ref={filterRef} className="relative ml-auto shrink-0">
          <button
            onClick={() => setShowFilter(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
              filtersActive
                ? 'bg-slate-900 text-white'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
            title="Filter"
          >
            <SlidersHorizontal className="w-3 h-3" />
            {filtersActive && <span>Filtered</span>}
          </button>

          {showFilter && (
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-3 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Flag</p>
                <div className="flex gap-1">
                  {(['all', 'flagged', 'unflagged'] as const).map(f => (
                    <button key={f} onClick={() => setFlagFilter(f)}
                      className={`flex-1 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                        flagFilter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}>
                      {f === 'all' ? 'All' : f === 'flagged' ? '✓ On' : 'Off'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Used</p>
                <div className="flex gap-1">
                  {(['all', 'used', 'unused'] as const).map(f => (
                    <button key={f} onClick={() => setUsedFilter(f)}
                      className={`flex-1 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                        usedFilter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}>
                      {f === 'all' ? 'All' : f === 'used' ? 'Used' : 'Unused'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Verse filter — only shown when multiple verses */}
              {sortedVerseRefs.length > 1 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Verses</p>
                  <div className="flex flex-wrap gap-1">
                    {sortedVerseRefs.map(ref => {
                      const isVisible = !hiddenVerses.has(ref)
                      const label = ref.replace(/^.+\s/, '')
                      return (
                        <button key={ref} onClick={() => onToggleVerse(ref)}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                            isVisible ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}>{label}</button>
                      )
                    })}
                  </div>
                </div>
              )}
              {(filtersActive || hiddenVerses.size > 0) && (
                <button
                  onClick={() => { setFlagFilter('all'); setUsedFilter('all'); allVerseRefs.forEach(r => hiddenVerses.has(r) && onToggleVerse(r)) }}
                  className="w-full py-1 text-[11px] text-slate-400 hover:text-slate-700 transition-colors"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="space-y-4 overflow-y-auto pb-4">

        {effectiveTab === 'notes' && visibleRefs.map(ref => {
          const notes = (verseNotes[ref] ?? []).filter(n => {
            if (!n.content.trim()) return false
            if (flagFilter === 'flagged'   && n.used_count === 0) return false
            if (flagFilter === 'unflagged' && n.used_count  > 0) return false
            if (usedFilter === 'used'      && n.used_count === 0) return false
            if (usedFilter === 'unused'    && n.used_count  > 0) return false
            return true
          })
          if (!notes.length) return null
          return (
            <div key={ref}>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">{ref}</p>
              <div className="space-y-1.5">
                {notes.map(note => (
                  <div key={note.id} className="group relative flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <p className="flex-1 text-sm text-slate-600 leading-relaxed pr-10">{note.content}</p>
                    <div className="flex items-center gap-1 shrink-0 absolute right-1 top-1.5">
                      {note.used_count > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-violet-100 text-violet-500 rounded-full">
                          {note.used_count}×
                        </span>
                      )}
                      <button
                        onClick={() => queue(note.id, note.content, 'sub_point', 'note')}
                        className={`p-1.5 rounded-lg transition-all ${
                          pendingItemId === note.id
                            ? 'text-violet-600 bg-violet-100 opacity-100'
                            : 'text-slate-300 hover:text-slate-700 hover:bg-slate-100 opacity-0 group-hover:opacity-100'
                        }`}
                        title="Place in outline"
                      ><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {effectiveTab !== 'notes' && (() => {
          return visibleRefs.map(ref => {
            const allItems = insights[ref]?.[effectiveTab] ?? []
            const items = allItems.filter(item => {
              if (flagFilter === 'flagged'   && !item.is_flagged) return false
              if (flagFilter === 'unflagged' &&  item.is_flagged) return false
              if (usedFilter === 'used'      && !(item.used_count ?? 0)) return false
              if (usedFilter === 'unused'    &&  (item.used_count ?? 0) > 0) return false
              return true
            })
            if (!items.length) return null
            return (
              <div key={ref}>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">{ref}</p>
                <div className="space-y-2">
                  {items.map(item => {
                    const origIdx = allItems.indexOf(item)
                    const pendKey = `${ref}-${effectiveTab}-${origIdx}`
                    const usedCnt = item.used_count ?? 0
                    return (
                      <div key={origIdx} className={`group relative border-l-2 pl-3 rounded-r-lg py-1 transition-colors ${
                        item.is_flagged ? 'border-slate-400 bg-slate-50' : 'border-slate-100 hover:border-slate-200'
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {item.title && (
                              effectiveTab === 'word_study'
                                ? <WordStudyTitle title={item.title} />
                                : <span className="text-xs font-semibold text-slate-700 block mb-0.5">{item.title}</span>
                            )}
                            <p className="text-sm text-slate-600 leading-relaxed">{item.content}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            {item.is_flagged && (
                              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600">✓</span>
                            )}
                            {usedCnt > 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-violet-100 text-violet-500 rounded-full">
                                {usedCnt}×
                              </span>
                            )}
                            <button
                              onClick={() => {
                                const type: PendingItem['type'] =
                                  effectiveTab === 'application' ? 'application'
                                  : effectiveTab === 'practical' ? 'illustration'
                                  : 'sub_point'
                                const content = item.title ? `${item.title} — ${item.content}` : item.content
                                queue(pendKey, content, type, 'research')
                              }}
                              className={`p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 ${
                                pendingItemId === pendKey
                                  ? 'text-violet-600 bg-violet-100 opacity-100'
                                  : 'text-slate-300 hover:text-slate-700 hover:bg-slate-100'
                              }`}
                              title="Place in outline"
                            ><Plus className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        })()}
      </div>
    </div>
  )
}

function WordStudyTitle({ title }: { title: string }) {
  const match = title.match(/^(.+?)\s+\((.+)\)$/)
  if (!match) return <span className="text-xs font-semibold text-slate-700 block mb-0.5">{title}</span>
  const [, original, transliteration] = match
  return (
    <span className="flex items-baseline gap-1.5 mb-0.5">
      <span className="text-sm font-bold text-slate-800">{original}</span>
      <span className="text-xs text-slate-500 italic">{transliteration}</span>
    </span>
  )
}
