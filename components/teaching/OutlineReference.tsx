'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, SlidersHorizontal } from 'lucide-react'
import type { VerseNote } from '@/types/database'
import type { PendingItem } from './TeachingWorkspace'

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
    const chA = parseInt(matchA[2]), chB = parseInt(matchB[2])
    if (chA !== chB) return chA - chB
    return parseInt(matchA[3]) - parseInt(matchB[3])
  })
}

const CATEGORIES = [
  { key: 'scripture',             label: 'Scripture'   },
  { key: 'word_study',            label: 'Word Study'      },
  { key: 'cross_refs',            label: 'Xref' },
  { key: 'practical',             label: 'Analogy'   },
  { key: 'theology_by_tradition', label: 'Theology'   },
  { key: 'context',               label: 'Context'    },
  { key: 'application',           label: 'Application'      },
  { key: 'quotes',                label: 'Quotes'     },
] as const

type CategoryKey = Exclude<typeof CATEGORIES[number]['key'], 'scripture'>
type InsightItem = { title: string; content: string; is_flagged?: boolean; used_count?: number }
type Insights    = Record<string, Record<string, InsightItem[]>>

interface Props {
  verses:           Array<{ verse_ref: string; text: string }>
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
  verses, insights, verseNotes, hiddenVerses, allVerseRefs, onToggleVerse, sessionId,
  pendingItemId, onPendingItem, onInsightsChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<'scripture' | CategoryKey | 'notes' | 'all'>('notes')
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

  const sortedVerseRefs = canonicalSort(allVerseRefs)
  const hasNotes    = sortedVerseRefs.some(r => verseNotes[r]?.some(n => n.content.trim()))
  const hasInsights = Object.keys(insights).length > 0

  if (!hasNotes && !hasInsights && verses.length === 0) {
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

  // Build visible CATEGORIES
  const visibleCATEGORIES: ('scripture' | CategoryKey | 'notes' | 'all')[] = []
  if (hasNotes) visibleCATEGORIES.push('notes')
    if (verses.length > 0) visibleCATEGORIES.push('scripture')
      for (const tab of CATEGORIES) {
        if (tab.key === 'scripture') continue
        if (Object.values(insights).some(cats => (cats[tab.key]?.length ?? 0) > 0)) visibleCATEGORIES.push(tab.key)
      }
  // Only show "All" if there's more than one content tab
  const hasAll = visibleCATEGORIES.length > 1
  if (hasAll) visibleCATEGORIES.push('all')

  const effectiveTab = visibleCATEGORIES.includes(activeTab) ? activeTab : (visibleCATEGORIES[0] ?? 'notes')

  function usedCount(tab: CategoryKey | 'scripture' | 'notes' | 'all') {
    if (tab === 'scripture') return 0
    if (tab === 'all') return 0
    if (tab === 'notes') return Object.values(verseNotes).flat().filter(n => n.used_count > 0).length
    let n = 0
    for (const cats of Object.values(insights)) {
      for (const item of cats[tab] ?? []) { if ((item.used_count ?? 0) > 0) n++ }
    }
    return n
  }

  const filtersActive = flagFilter !== 'all' || usedFilter !== 'all' || hiddenVerses.size > 0

  // ── Filter helper ──────────────────────────────────────────────────────────
  function filterNote(n: VerseNote) {
    if (!n.content.trim()) return false
    if (flagFilter === 'flagged'   && n.used_count === 0) return false
    if (flagFilter === 'unflagged' && n.used_count  > 0) return false
    if (usedFilter === 'used'      && n.used_count === 0) return false
    if (usedFilter === 'unused'    && n.used_count  > 0) return false
    return true
  }
  function filterItem(item: InsightItem) {
    if (flagFilter === 'flagged'   && !item.is_flagged) return false
    if (flagFilter === 'unflagged' &&  item.is_flagged) return false
    if (usedFilter === 'used'      && !(item.used_count ?? 0)) return false
    if (usedFilter === 'unused'    &&  (item.used_count ?? 0) > 0) return false
    return true
  }

  // ── Render a single research item ─────────────────────────────────────────
  function renderItem(ref: string, catKey: CategoryKey, item: InsightItem, origIdx: number) {
    const pendKey = `${ref}-${catKey}-${origIdx}`
    const usedCnt = item.used_count ?? 0
    const cat     = CATEGORIES.find(c => c.key === catKey)
    return (
      <div key={`${catKey}-${origIdx}`} className={`group relative border-l-2 pl-3 rounded-r-lg py-1 transition-colors ${
        item.is_flagged ? 'border-slate-400 bg-slate-50' : 'border-slate-100 hover:border-slate-200'
      }`}>
 <div className="flex items-start gap-2">
  <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
    <button
      onClick={() => {
        const type: PendingItem['type'] =
          catKey === 'application' ? 'application'
          : catKey === 'practical' ? 'illustration'
          : 'sub_point'
        const content = item.title ? `${item.title} — ${item.content}` : item.content
        queue(pendKey, content, type, 'research')
      }}
      className={`p-1 rounded-lg transition-all ${
        pendingItemId === pendKey
          ? 'text-violet-600 bg-violet-100'
          : 'text-slate-200 hover:text-slate-600 hover:bg-slate-100'
      }`}
      title="Place in outline"
    >
      <Plus className="w-3 h-3" />
    </button>

    {usedCnt > 0 && (
      <span className="text-[10px] font-bold px-1 py-0.5 bg-violet-100 text-violet-500 rounded-full">
        {usedCnt}×
      </span>
    )}

    {item.is_flagged && (
      <span className="text-[10px] font-bold px-1 py-0.5 rounded-full bg-slate-200 text-slate-600">
        ✓
      </span>
    )}
  </div>

  <div className="flex-1 min-w-0">
            {/* Category label in All view */}
            {effectiveTab === 'all' && cat && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-300 mr-1">{cat.label}</span>
            )}
            {item.title && (
              catKey === 'word_study'
                ? <WordStudyTitle title={item.title} />
                : <span className="text-xs font-semibold text-slate-700 block mb-0.5">{item.title}</span>
            )}
            <p className="text-sm text-slate-600 leading-relaxed">{item.content}</p>
          </div>

        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 min-h-0">

      {/* ── CATEGORIES with filter icon immediately after last tab ─────────────── */}
      <div className="flex items-center gap-1 flex-wrap">
        {visibleCATEGORIES.map(tab => {
          const cat = CATEGORIES.find(c => c.key === tab)
          const isActive = tab === effectiveTab
          const used     = usedCount(tab)
          const isAll    = tab === 'all'
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? isAll ? 'bg-slate-700 text-white' : 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
              }`}
            >
              {tab === 'notes' ? 'Notes' : tab === 'all' ? 'All' : cat?.label}
              {used > 0 && (
                <span className={`ml-1 text-[10px] font-bold ${isActive ? 'opacity-60' : 'opacity-50'}`}>{used}</span>
              )}
            </button>
          )
        })}

        {/* Filter icon — immediately after last tab */}
        <div ref={filterRef} className="relative shrink-0">
          <button
            onClick={() => setShowFilter(v => !v)}
            className={`flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              filtersActive
                ? 'bg-slate-900 text-white'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
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
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {/* SCRIPTURE tab */}
{effectiveTab === 'scripture' && visibleRefs.map(ref => {
  const verse = verses.find(v => v.verse_ref === ref)
  if (!verse) return null

  const pendKey = `scripture:${ref}`

  return (
    <div key={`scripture-${ref}`}>
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">{ref}</p>
      <div className="group flex items-start gap-1.5 rounded-lg px-1 py-1 hover:bg-slate-50">
        <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
          <button
            onClick={() => onPendingItem({
              content: `${ref} ${verse.text}`,
              type: 'scripture',
              sourceKind: 'research',
              sourceId: pendKey,
            })}
            className={`p-1 rounded-lg transition-all ${
              pendingItemId === pendKey
                ? 'text-violet-600 bg-violet-100'
                : 'text-slate-200 hover:text-slate-600 hover:bg-slate-100'
            }`}
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
})}
      <div className="space-y-4 overflow-y-auto pb-4">

        {/* NOTES tab */}
        {(effectiveTab === 'notes' || effectiveTab === 'all') && visibleRefs.map(ref => {
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
     className={`p-1 rounded-lg transition-all ${
       pendingItemId === note.id
         ? 'text-violet-600 bg-violet-100'
         : 'text-slate-200 hover:text-slate-600 hover:bg-slate-100'
     }`}
     title="Place in outline"
   >
     <Plus className="w-3 h-3" />
   </button>

   {note.used_count > 0 && (
     <span className="text-[10px] font-bold px-1.5 py-0.5 bg-violet-100 text-violet-500 rounded-full">
       {note.used_count}×
     </span>
   )}
 </div>

 <div className="flex-1 min-w-0">
   {effectiveTab === 'all' && (
     <span className="text-[10px] font-bold uppercase tracking-wide text-slate-300 mr-1">Note</span>
   )}
   <p className="text-sm text-slate-600 leading-relaxed">{note.content}</p>
 </div>
</div>
                ))}
              </div>
            </div>
          )
        })}

        {/* SINGLE CATEGORY tab */}
        {effectiveTab !== 'notes' && effectiveTab !== 'all' && effectiveTab !== 'scripture' && (() => {
  return visibleRefs.map(ref => {
    const allItems = insights[ref]?.[effectiveTab] ?? []
    const items = allItems.filter(filterItem)
    if (!items.length) return null
    return (
      <div key={ref}>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">{ref}</p>
        <div className="space-y-2">
          {items.map(item => renderItem(ref, effectiveTab, item, allItems.indexOf(item)))}
        </div>
      </div>
    )
  })
})()}

        {/* ALL tab — flagged items first, then everything else */}
        {effectiveTab === 'all' && (() => {
          return visibleRefs.map(ref => {
            // Collect all items across categories
            const allCatItems: { catKey: CategoryKey; item: InsightItem; origIdx: number }[] = []
            for (const cat of CATEGORIES) {
              if (cat.key === 'scripture') continue
            
              const catKey = cat.key as CategoryKey
              const catItems = insights[ref]?.[catKey] ?? []
              catItems.forEach((item, idx) => {
                if (filterItem(item)) allCatItems.push({ catKey, item, origIdx: idx })
              })
            }
            if (!allCatItems.length) return null
            // Flagged items first
            const flagged   = allCatItems.filter(x => x.item.is_flagged)
            const unflagged = allCatItems.filter(x => !x.item.is_flagged)
            const sorted    = [...flagged, ...unflagged]
            return (
              <div key={`all-${ref}`}>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">{ref}</p>
                <div className="space-y-2">
                  {sorted.map(({ catKey, item, origIdx }) => renderItem(ref, catKey, item, origIdx))}
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
