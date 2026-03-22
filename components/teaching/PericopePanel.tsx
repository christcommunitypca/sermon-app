'use client'
// ── components/teaching/PericopePanel.tsx ────────────────────────────────────
// Section-by-section research panel for narrative passages.
// Scripture spans full width; notes and AI research sit below in two columns.
// Words can be selected directly from the Scripture text for pericope word study.

import { useState, useCallback, useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  ChevronDown, Sparkles, Loader2, Check,
  Plus, X, AlertCircle, ArrowUp, ArrowDown, Trash2, Wand2,
} from 'lucide-react'
import type { VerseData, SectionHeader } from '@/lib/esv'
import type { VerseNote } from '@/types/database'
import {
  generatePericopeInsightsAction,
  savePericopeSectionsAction,
  createVerseNoteAction,
  updateVerseNoteAction,
  deleteVerseNoteAction,
  reorderVerseNotesAction,
  splitVerseNotesAction,
} from '@/app/actions/verse-study'
import { toggleInsightFlagAction } from '@/app/actions/verse-study'
import { parseWordStudyTitle } from '@/lib/word-study'
// ── Types ─────────────────────────────────────────────────────────────────────

type InsightItem = {
  title: string
  content: string
  source_label?: string
  source_url?: string
  is_flagged?: boolean
  used_count?: number
}
type Insights    = Record<string, Record<string, InsightItem[]>>
type SaveState   = 'idle' | 'saving' | 'saved' | 'error'
const SHARED_INSIGHTS_KEY = 'session:shared'
type DisplayInsightItem = InsightItem & { __sourceRef: string; __sourceIndex: number; __shared?: boolean }

function getDisplayInsightItems(
  insights: Insights,
  scopeRef: string,
  category: CategoryKey
): DisplayInsightItem[] {
  const specific = (insights[scopeRef]?.[category] ?? []).map((item, index) => ({
    ...item,
    __sourceRef: scopeRef,
    __sourceIndex: index,
  }))
  const shared = (insights[SHARED_INSIGHTS_KEY]?.[category] ?? []).map((item, index) => ({
    ...item,
    __sourceRef: SHARED_INSIGHTS_KEY,
    __sourceIndex: index,
    __shared: true,
  }))

  return [...specific, ...shared]
}

const CATEGORIES = [
  { key: 'word_study',            label: 'Word Study'      },
  { key: 'cross_refs',            label: 'Xref' },
  { key: 'practical',             label: 'Analogy'   },
  { key: 'theology_by_tradition', label: 'Theology'   },
  { key: 'context',               label: 'Context'    },
  { key: 'application',           label: 'Application'      },
  { key: 'quotes',                label: 'Quotes'     },
] as const
type CategoryKey = typeof CATEGORIES[number]['key']

type PaneKey = 'scripture' | 'notes' | 'research'


interface Props {
  sessionId: string
  churchId: string
  verses: VerseData[]
  sections: SectionHeader[]
  hasHeaders: boolean
  insights: Insights
  verseNotes: Record<string, VerseNote[]>
  onInsightsChange: (i: Insights) => void
  onVerseNotesChange: (n: Record<string, VerseNote[]>) => void
  onSectionsChange: (s: SectionHeader[]) => void
  setupComplete: boolean
  onSetupCompleteChange: (complete: boolean) => void
  pending: { id: string; content: string; type: string; source: string } | null
  onItemPlaced: (item: { id: string; content: string; type: string; source: string }) => void
  focusMode: boolean
  activeSectionIdx: number
  onActiveSectionChange: (idx: number) => void
  paneVisibility: { scripture: boolean; notes: boolean; research: boolean }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function versesForSection(verses: VerseData[], sections: SectionHeader[], idx: number): VerseData[] {
  const start = sections[idx].startVerse
  const explicitEnd = sections[idx].endVerse
  const impliedEnd  = idx + 1 < sections.length ? sections[idx + 1].startVerse : null

  const startIdx = verses.findIndex(v => v.verse_ref === start)
  if (startIdx === -1) return []

  if (explicitEnd) {
    const endIdx = verses.findIndex(v => v.verse_ref === explicitEnd)
    return endIdx >= startIdx ? verses.slice(startIdx, endIdx + 1) : verses.slice(startIdx, startIdx + 1)
  }

  if (impliedEnd) {
    const endIdx = verses.findIndex(v => v.verse_ref === impliedEnd)
    return endIdx > startIdx ? verses.slice(startIdx, endIdx) : verses.slice(startIdx)
  }

  return verses.slice(startIdx)
}

function verseRangeLabel(sectionVerses: VerseData[]): string {
  if (!sectionVerses.length) return ''
  if (sectionVerses.length === 1) return sectionVerses[0].verse_ref
  const first = sectionVerses[0].verse_ref
  const last  = sectionVerses[sectionVerses.length - 1].verse_ref
  const firstParts = first.match(/^(.+)\s(\d+):(\d+)$/)
  const lastParts  = last.match(/^(.+)\s(\d+):(\d+)$/)
  if (firstParts && lastParts && firstParts[1] === lastParts[1] && firstParts[2] === lastParts[2]) {
    return `${firstParts[1]} ${firstParts[2]}:${firstParts[3]}–${lastParts[3]}`
  }
  return `${first}–${last}`
}

function sectionNoteRef(startVerse: string) {
  return `pericope:${startVerse}`
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'from', 'into', 'upon', 'over',
  'then', 'than', 'they', 'them', 'their', 'there', 'this', 'these',
  'those', 'have', 'has', 'had', 'was', 'were', 'are', 'his', 'her',
  'him', 'she', 'you', 'your', 'yours', 'our', 'ours', 'but', 'not',
  'all', 'any', 'who', 'what', 'when', 'where', 'why', 'how', 'out',
  'off', 'too', 'very', 'can', 'could', 'would', 'should', 'said',
  'say', 'says', 'did', 'does', 'done', 'been', 'being', 'will',
  'shall', 'may', 'might', 'must', 'let', 'lets', 'unto', 'after',
  'before', 'because', 'through', 'under', 'again', 'also', 'about',
  'each', 'such', 'only', 'once', 'well', 'some', 'many', 'much'
])


const SCRIPTURE_FONT_SIZES = [14, 15, 16, 18, 20, 22] as const

const THEOLOGY_KEYWORDS = new Set([
  'covenant', 'promise', 'promised', 'blessing', 'bless', 'seed', 'offspring',
  'faith', 'righteous', 'righteousness', 'grace', 'mercy', 'judgment', 'altar',
  'sacrifice', 'angel', 'lord', 'god', 'abraham', 'isaac', 'jacob', 'esau',
  'inheritance', 'oath', 'holy', 'redeem', 'redemption', 'save', 'salvation',
  'fear', 'worship', 'obedience', 'sin', 'repent', 'repentance', 'kingdom'
])

function normalizeStudyWord(raw: string) {
  return raw.toLowerCase().replace(/^['’]+|['’]+$/g, '')
}

function isSelectableStudyWord(raw: string) {
  const word = normalizeStudyWord(raw)
  if (!word) return false
  if (word.length < 4) return false
  if (STOP_WORDS.has(word)) return false
  return /^[a-z][a-z'’-]*$/.test(word)
}

function buildWordStudySuggestions(sectionVerses: VerseData[]): string[] {
  const records = new Map<string, {
    display: string
    count: number
    verseRefs: Set<string>
    properNoun: boolean
    theological: boolean
  }>()

  for (const verse of sectionVerses) {
    const tokens = verse.text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []
    for (let i = 0; i < tokens.length; i++) {
      const raw = tokens[i]
      const word = normalizeStudyWord(raw)
      if (!isSelectableStudyWord(raw)) continue

      const existing = records.get(word) ?? {
        display: raw,
        count: 0,
        verseRefs: new Set<string>(),
        properNoun: false,
        theological: false,
      }

      existing.count += 1
      existing.verseRefs.add(verse.verse_ref)
      if (/^[A-Z]/.test(raw) && i !== 0) existing.properNoun = true
      if (THEOLOGY_KEYWORDS.has(word)) existing.theological = true
      if (!existing.display || existing.display === word) existing.display = raw

      records.set(word, existing)
    }
  }

  return Array.from(records.entries())
    .map(([word, data]) => {
      const spreadScore = data.verseRefs.size * 2
      const countScore = data.count * 3
      const properNounBonus = data.properNoun ? 3 : 0
      const theologyBonus = data.theological ? 4 : 0
      const lengthBonus = word.length >= 5 && word.length <= 10 ? 1 : 0

      return {
        word,
        display: data.display,
        score: countScore + spreadScore + properNounBonus + theologyBonus + lengthBonus,
      }
    })
    .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
    .slice(0, 18)
    .map(item => item.display)
}

function toggleSelectedWord(
  current: Record<string, string[]>,
  sectionKey: string,
  word: string
) {
  const normalized = normalizeStudyWord(word)
  const existing = current[sectionKey] ?? []
  const hasWord = existing.some(w => normalizeStudyWord(w) === normalized)

  if (hasWord) {
    return {
      ...current,
      [sectionKey]: existing.filter(w => normalizeStudyWord(w) !== normalized),
    }
  }

  return {
    ...current,
    [sectionKey]: [...existing, word].slice(0, 16),
  }
}

function renderSelectableVerseText(
  text: string,
  selectedWords: string[],
  onToggle: (word: string) => void
) {
  const selected = selectedWords.map(normalizeStudyWord)
  const parts = text.split(/([A-Za-z][A-Za-z'’-]*)/g)

  return parts.map((part, idx) => {
    if (!/^[A-Za-z][A-Za-z'’-]*$/.test(part)) {
      return <span key={idx}>{part}</span>
    }

    const selectable = isSelectableStudyWord(part)
    const isSelected = selected.includes(normalizeStudyWord(part))

    if (!selectable) {
      return <span key={idx}>{part}</span>
    }

    return (
      <button
        key={idx}
        type="button"
        onClick={() => onToggle(part)}
        className={`rounded-sm px-0.5 transition-colors ${
          isSelected
            ? 'bg-violet-200 text-slate-900'
            : 'hover:bg-violet-50 hover:text-slate-900'
        }`}
        title={isSelected ? 'Remove from word study focus' : 'Add to word study focus'}
      >
        {part}
      </button>
    )
  })
}

// ── Main component ────────────────────────────────────────────────────────────

export function PericopePanel({
  sessionId,
  churchId,
  verses,
  sections,
  hasHeaders,
  insights,
  verseNotes,
  onInsightsChange,
  onVerseNotesChange,
  onSectionsChange,
  setupComplete,
  onSetupCompleteChange,
  pending,
  onItemPlaced,
  focusMode,
  activeSectionIdx,
  onActiveSectionChange,
  paneVisibility,
}: Props) {
  const [activeCategoryBySection, setActiveCategoryBySection] = useState<Record<string, CategoryKey>>({})
  const [mobileTabBySection, setMobileTabBySection] = useState<Record<string, 'scripture' | 'notes' | 'research'>>({})
  const [generatingBySection, setGeneratingBySection] = useState<Record<string, boolean>>({})
  const [organizingBySection, setOrganizingBySection] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [selectedWordsBySection, setSelectedWordsBySection] = useState<Record<string, string[]>>({})
  const [showWordToolsBySection, setShowWordToolsBySection] = useState<Record<string, boolean>>({})
  const [composerBySection, setComposerBySection] = useState<Record<string, string>>({})
  const [creatingBySection, setCreatingBySection] = useState<Record<string, boolean>>({})
  const [noteSaveStates, setNoteSaveStates] = useState<Record<string, SaveState>>({})
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({})
  const [titleSavingBySection, setTitleSavingBySection] = useState<Record<string, boolean>>({})
  const [scriptureFontIdx, setScriptureFontIdx] = useState(2)
  const [paneWidths, setPaneWidths] = useState<Record<PaneKey, number>>({
    scripture: 34,
    notes: 30,
    research: 36,
  })
  const dragRef = useRef<{ left: PaneKey; right: PaneKey; startX: number; startLeft: number; startRight: number } | null>(null)

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const blocks = useMemo(() => sections.map((section, idx) => ({
    section,
    idx,
    sectionKey: sectionNoteRef(section.startVerse),
    verses: versesForSection(verses, sections, idx),
  })), [sections, verses])

  const activeBlock = blocks[activeSectionIdx] ?? null
  const activeSectionKey = activeBlock?.sectionKey ?? ''
  const visibleBlocks = activeBlock ? [activeBlock] : []
  useEffect(() => {
    const raw = localStorage.getItem('teaching-pane-widths')
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed?.scripture && parsed?.notes && parsed?.research) {
          setPaneWidths(parsed)
        }
      } catch {}
    }
  }, [])

  
  useEffect(() => {
    localStorage.setItem('teaching-pane-widths', JSON.stringify(paneWidths))
  }, [paneWidths])
  
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return
      const { left, right, startX, startLeft, startRight } = dragRef.current
      const delta = (e.clientX - startX) / 12
      const nextLeft = Math.max(15, startLeft + delta)
      const nextRight = Math.max(15, startRight - delta)
      if (nextLeft + nextRight < 30) return
  
      setPaneWidths(prev => ({
        ...prev,
        [left]: nextLeft,
        [right]: nextRight,
      }))
    }
  
    function onUp() {
      dragRef.current = null
    }
  
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])


  useEffect(() => {
    setTitleDrafts(prev => {
      const next = { ...prev }
      for (const block of blocks) {
        if (!next[block.sectionKey]) next[block.sectionKey] = block.section.label
      }
      return next
    })
  }, [blocks])

  useEffect(() => {
    return () => {
      Object.values(saveTimers.current).forEach(clearTimeout)
    }
  }, [])

  function sectionHasResearch(sectionKey: string) {
    return Object.values(insights[sectionKey] ?? {}).some(items => items.length > 0)
  }

  async function handleGenerateForSection(block: (typeof blocks)[number]) {
    const sectionKey = block.sectionKey
    setGeneratingBySection(prev => ({ ...prev, [sectionKey]: true }))
    setError(null)

    const result = await generatePericopeInsightsAction(
      sessionId,
      churchId,
      {
        label: titleDrafts[sectionKey] || block.section.label,
        startVerse: block.section.startVerse,
        verses: block.verses,
      },
      (selectedWordsBySection[sectionKey] ?? []).slice(0, 5),
    )

    setGeneratingBySection(prev => ({ ...prev, [sectionKey]: false }))

    if (result.error) {
      setError(result.error)
      return
    }

    if (result.sectionKey && result.insights) {
      onInsightsChange({
        ...insights,
        [result.sectionKey]: {
          ...(insights[result.sectionKey] ?? {}),
          ...result.insights,
        },
      })
    }

    onActiveSectionChange(block.idx)
    setMobileTabBySection(prev => ({ ...prev, [sectionKey]: 'research' }))
    setActiveCategoryBySection(prev => ({ ...prev, [sectionKey]: 'context' }))
  }

  async function handleSaveTitle(block: (typeof blocks)[number]) {
    const sectionKey = block.sectionKey
    const nextLabel = (titleDrafts[sectionKey] ?? '').trim() || block.section.label
    if (nextLabel === block.section.label) return

    const nextSections = sections.map((section, idx) =>
      idx === block.idx ? { ...section, label: nextLabel } : section
    )

    setTitleSavingBySection(prev => ({ ...prev, [sectionKey]: true }))
    const result = await savePericopeSectionsAction(
      sessionId,
      nextSections.map(section => ({ label: section.label, startVerse: section.startVerse }))
    )
    setTitleSavingBySection(prev => ({ ...prev, [sectionKey]: false }))

    if (result.error) {
      setError(result.error)
      return
    }
    onSectionsChange(nextSections)
  }

  async function handleCreateNote(sectionKey?: string) {
    const key = sectionKey ?? activeSectionKey
    if (!key) return
    const content = (composerBySection[key] ?? '').trim()
    if (!content) return

    setCreatingBySection(prev => ({ ...prev, [key]: true }))
    const result = await createVerseNoteAction(sessionId, churchId, key, content)
    setCreatingBySection(prev => ({ ...prev, [key]: false }))
    if (result.error || !result.note) return

    onVerseNotesChange({
      ...verseNotes,
      [key]: [...(verseNotes[key] ?? []), result.note],
    })
    setComposerBySection(prev => ({ ...prev, [key]: '' }))
  }

  function handleNoteChange(noteId: string, value: string) {
    setNoteDrafts(prev => ({ ...prev, [noteId]: value }))
    setNoteSaveStates(prev => ({ ...prev, [noteId]: 'saving' }))
    if (saveTimers.current[noteId]) clearTimeout(saveTimers.current[noteId])

    saveTimers.current[noteId] = setTimeout(async () => {
      const result = await updateVerseNoteAction(noteId, value)
      setNoteSaveStates(prev => ({ ...prev, [noteId]: result.error ? 'error' : 'saved' }))
      onVerseNotesChange(
        Object.fromEntries(
          Object.entries(verseNotes).map(([key, notes]) => [
            key,
            notes.map(n => n.id === noteId ? { ...n, content: value } : n),
          ])
        )
      )
      if (!result.error) {
        setTimeout(() => setNoteSaveStates(prev => ({ ...prev, [noteId]: 'idle' })), 1800)
      }
    }, 700)
  }

  async function handleDeleteNote(sectionKey: string, noteId: string) {
    const result = await deleteVerseNoteAction(noteId)
    if (result.error) return
    onVerseNotesChange({
      ...verseNotes,
      [sectionKey]: (verseNotes[sectionKey] ?? []).filter(n => n.id !== noteId),
    })
  }

  async function handleMoveNote(sectionKey: string, noteId: string, direction: 'up' | 'down') {
    const notes = [...(verseNotes[sectionKey] ?? [])]
    const idx = notes.findIndex(n => n.id === noteId)
    if (idx === -1) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === notes.length - 1) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    ;[notes[idx], notes[swapIdx]] = [notes[swapIdx], notes[idx]]
    onVerseNotesChange({ ...verseNotes, [sectionKey]: notes })
    await reorderVerseNotesAction(notes.map(n => n.id))
  }

  async function handleOrganizeSectionNotes(sectionKey: string) {
    const ids = (verseNotes[sectionKey] ?? []).map(note => note.id)
    if (!ids.length) return

    setOrganizingBySection(prev => ({ ...prev, [sectionKey]: true }))
    const result = await splitVerseNotesAction(sessionId, churchId, ids)
    setOrganizingBySection(prev => ({ ...prev, [sectionKey]: false }))

    if (result.error) {
      setError(result.error)
      return
    }
    onVerseNotesChange(result.verseNotes)
  }

  const showSetupEditor = !setupComplete
  if (showSetupEditor) {
    return (
      <ManualSectionEditor
        verses={verses}
        initialSections={sections}
        hasHeaders={hasHeaders}
        onSave={async (sects) => {
          await savePericopeSectionsAction(sessionId, sects)
          onSectionsChange(sects)
          onSetupCompleteChange(true)
        }}
      />
    )
  }

  if (!activeBlock) return null

  function renderScripturePane(block: (typeof blocks)[number]) {
    const words = selectedWordsBySection[block.sectionKey] ?? []
    const fontSize = SCRIPTURE_FONT_SIZES[scriptureFontIdx] ?? 16
    const lineHeight = Math.max(fontSize + 14, 28)
    return (
      <div className="space-y-2">
        {block.verses.map(v => (
          <p key={v.verse_ref} className="text-slate-700" style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}>
            <span className="text-xs font-bold text-slate-400 mr-1">{v.verse_ref}</span>
            {renderSelectableVerseText(v.text, words, (word) => {
              onActiveSectionChange(block.idx)
              setSelectedWordsBySection(prev => toggleSelectedWord(prev, block.sectionKey, word))
            })}
          </p>
        ))}
      </div>
    )
  }


  function renderNotesPane(block: (typeof blocks)[number]) {
    const sectionKey = block.sectionKey
    const notes = verseNotes[sectionKey] ?? []
    const composerValue = composerBySection[sectionKey] ?? ''

    return (
      <div className="space-y-3 h-full flex flex-col min-h-0">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <AutoResizeTextarea
            value={composerValue}
            onChange={val => setComposerBySection(prev => ({ ...prev, [sectionKey]: val }))}
            placeholder="Type your thoughts..."
            className="w-full text-sm text-slate-700 bg-transparent resize-none focus:outline-none placeholder:text-slate-400 leading-relaxed min-h-[90px]"
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault()
                await handleCreateNote(sectionKey)
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">Click Shift + Enter to save</span>
            <button
              type="button"
              onClick={() => handleCreateNote(sectionKey)}
              disabled={creatingBySection[sectionKey] || !composerValue.trim()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs hover:bg-slate-700 disabled:opacity-50"
            >
              {creatingBySection[sectionKey] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
          {notes.length === 0 ? (
            <p className="text-sm text-slate-400">No notes yet for this section.</p>
          ) : (
            notes.map((note, noteIdx) => {
              const draft = noteDrafts[note.id] ?? note.content
              const saveState = noteSaveStates[note.id] ?? 'idle'
              const isPending = pending?.id === note.id

              return (
                <div key={note.id} className="group rounded-xl border border-slate-200 bg-white p-2.5">
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col items-center gap-0.5 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleMoveNote(sectionKey, note.id, 'up')} disabled={noteIdx === 0} className="p-0.5 rounded text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors"><ArrowUp className="w-3 h-3" /></button>
                      <button onClick={() => handleMoveNote(sectionKey, note.id, 'down')} disabled={noteIdx === notes.length - 1} className="p-0.5 rounded text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors"><ArrowDown className="w-3 h-3" /></button>
                    </div>

                    <AutoResizeTextarea
                      value={draft}
                      onChange={val => handleNoteChange(note.id, val)}
                      placeholder="Type your thoughts..."
                      className="flex-1 text-sm text-slate-700 bg-transparent resize-none focus:outline-none placeholder:text-slate-300 leading-relaxed min-h-[40px]"
                    />

                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <button
                        onClick={() => onItemPlaced({ id: note.id, content: draft.trim() || note.content, type: 'sub_point', source: 'note' })}
                        className={`p-1 rounded transition-colors ${isPending ? 'text-violet-600 bg-violet-100' : 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'}`}
                        title="Place in outline"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      {saveState === 'saving' && <Loader2 className="w-3 h-3 text-slate-300 animate-spin" />}
                      {saveState === 'saved' && <Check className="w-3 h-3 text-emerald-500" strokeWidth={2.5} />}
                      {saveState === 'error' && <AlertCircle className="w-3 h-3 text-red-400" />}
                      <button onClick={() => handleDeleteNote(sectionKey, note.id)} className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  function renderResearchPane(block: (typeof blocks)[number]) {
    const sectionKey = block.sectionKey
    const category = activeCategoryBySection[sectionKey] ?? 'context'
    const items = getDisplayInsightItems(insights, sectionKey, category)
    const selectedWords = selectedWordsBySection[sectionKey] ?? []
    const displayWords = selectedWords.slice(0, 5)
    const showWordTools = showWordToolsBySection[sectionKey] ?? false
    const hasResearch = sectionHasResearch(sectionKey)
    const wordCandidates = buildWordStudySuggestions(block.verses)

    return (
      <div className="space-y-3 h-full flex flex-col min-h-0">
        {!hasResearch && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">AI word study</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Select up to five words from the Scripture to tell AI which words to study.</p>
                {displayWords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {displayWords.map(word => (
                      <span key={word} className="px-2 py-1 rounded-full text-[11px] border bg-violet-100 border-violet-300 text-violet-700">
                        {word}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowWordToolsBySection(prev => ({ ...prev, [sectionKey]: !showWordTools }))}
                className="text-[11px] text-violet-600 hover:text-violet-800 shrink-0"
              >
                {showWordTools ? 'Hide' : 'Show'}
              </button>
            </div>
            {showWordTools && (
              <div className="mt-2 pt-2 border-t border-slate-200">
                <p className="text-xs font-semibold text-slate-700">Suggested Words</p>
                <p className="text-[11px] text-slate-500 mt-0.5 mb-2">Select words to add them to AI word study.</p>
                <div className="flex flex-wrap gap-1.5">
                  {wordCandidates.map(word => {
                    const selected = selectedWords.some(w => normalizeStudyWord(w) === normalizeStudyWord(word))
                    return (
                      <button
                        key={word}
                        type="button"
                        onClick={() => setSelectedWordsBySection(prev => toggleSelectedWord(prev, sectionKey, word))}
                        className={`px-2 py-1 rounded-full text-[11px] border transition-colors ${selected ? 'bg-violet-100 border-violet-300 text-violet-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
                      >
                        {word}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1 flex-wrap">
          {CATEGORIES.map(c => {
            const catItems = getDisplayInsightItems(insights, sectionKey, c.key)
            const isActive = category === c.key
            return (
              <button
                key={c.key}
                onClick={() => setActiveCategoryBySection(prev => ({ ...prev, [sectionKey]: c.key }))}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${isActive ? 'bg-slate-900 text-white' : catItems.length ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'text-slate-300'}`}
              >
                {c.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
          {generatingBySection[sectionKey] ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating research for this section…</div>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-400">{hasResearch ? 'No items in this category yet.' : 'Generate AI for this section when you are ready.'}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item, i) => (
                <ResearchItem
                  key={i}
                  item={item}
                  pending={pending}
                  allowPlace={false}
                  selectable
                  onToggleFlag={(newFlagged) => {
                    onInsightsChange({
                      ...insights,
                      [item.__sourceRef]: {
                        ...(insights[item.__sourceRef] ?? {}),
                        [category]: (insights[item.__sourceRef]?.[category] ?? []).map((it, itemIdx) => itemIdx === item.__sourceIndex ? { ...it, is_flagged: newFlagged } : it),
                      },
                    })
                    toggleInsightFlagAction(sessionId, item.__sourceRef, category, item.__sourceIndex, newFlagged).catch(() => null)
                  }}
                  onPlace={() => {
                    const content = item.title ? `${item.title} — ${item.content}` : item.content
                    onItemPlaced({
                      id: `${item.__sourceRef}-${category}-${item.__sourceIndex}`,
                      content,
                      type: category === 'application' ? 'application' : category === 'practical' ? 'illustration' : 'sub_point',
                      source: 'research',
                    })
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  function visibleDesktopPanes(): PaneKey[] {
    return (['scripture', 'notes', 'research'] as PaneKey[]).filter(p => paneVisibility[p])
  }
  
  function desktopGridTemplate() {
    const panes = visibleDesktopPanes()
    if (panes.length === 0) return 'minmax(0,1fr)'
    const total = panes.reduce((sum, pane) => sum + paneWidths[pane], 0)
    return panes.map(pane => `minmax(260px, ${paneWidths[pane] / total}fr)`).join(' ')
  }
  
  function startResize(left: PaneKey, right: PaneKey, clientX: number) {
    dragRef.current = {
      left,
      right,
      startX: clientX,
      startLeft: paneWidths[left],
      startRight: paneWidths[right],
    }
  }
  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0">
        {visibleBlocks.map(block => {
          const sectionKey = block.sectionKey
          const mobileTab = mobileTabBySection[sectionKey] ?? 'scripture'
          const hasResearch = sectionHasResearch(sectionKey)
          const notes = verseNotes[sectionKey] ?? []
          const workingHeight = focusMode ? 'h-[calc(100vh-7.5rem)]' : 'h-[calc(100vh-13rem)]'

          return (
            <div key={sectionKey} className={`rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col min-h-0 ${workingHeight}`}>
              <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
                <div className="shrink-0 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setScriptureFontIdx(idx => Math.max(0, idx - 1))}
                    disabled={scriptureFontIdx === 0}
                    className={`h-7 w-7 rounded-lg border text-slate-500 transition-colors ${scriptureFontIdx === 0 ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-200 hover:bg-slate-50 hover:text-slate-700'}`}
                    title="Smaller scripture text"
                  >
                    <span className="text-[11px] font-semibold leading-none">A</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScriptureFontIdx(idx => Math.min(SCRIPTURE_FONT_SIZES.length - 1, idx + 1))}
                    disabled={scriptureFontIdx === SCRIPTURE_FONT_SIZES.length - 1}
                    className={`h-7 w-7 rounded-lg border text-slate-500 transition-colors ${scriptureFontIdx === SCRIPTURE_FONT_SIZES.length - 1 ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-200 hover:bg-slate-50 hover:text-slate-700'}`}
                    title="Larger scripture text"
                  >
                    <span className="text-[15px] font-semibold leading-none">A</span>
                  </button>
                </div>
                <input
                  value={titleDrafts[sectionKey] ?? block.section.label}
                  onChange={e => setTitleDrafts(prev => ({ ...prev, [sectionKey]: e.target.value }))}
                  onBlur={() => handleSaveTitle(block)}
                  className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-slate-800 focus:outline-none"
                />
                {notes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleOrganizeSectionNotes(sectionKey)}
                    disabled={organizingBySection[sectionKey]}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-violet-200 text-violet-700 text-[11px] hover:bg-violet-50 disabled:opacity-50 shrink-0"
                  >
                    {organizingBySection[sectionKey] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    Organize notes
                  </button>
                )}
                {titleSavingBySection[sectionKey] && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-300" />}
                <button
                  onClick={() => !hasResearch && handleGenerateForSection(block)}
                  disabled={hasResearch || generatingBySection[sectionKey]}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors shrink-0 ${hasResearch ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'text-violet-700 hover:bg-violet-50 border border-violet-200'}`}
                >
                  {generatingBySection[sectionKey] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {generatingBySection[sectionKey] ? 'Generating…' : hasResearch ? 'AI ready' : 'Generate AI'}
                </button>
              </div>

              <div className="md:hidden px-3 pt-3">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                  {(['scripture', 'notes', 'research'] as const).map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => { onActiveSectionChange(block.idx); setMobileTabBySection(prev => ({ ...prev, [sectionKey]: tab })) }}
                      className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize ${mobileTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                    >
                      {tab === 'research' ? 'AI' : tab}
                    </button>
                  ))}
                </div>
              </div>
<div
  className="hidden md:grid flex-1 min-h-0 relative"
  style={{ gridTemplateColumns: desktopGridTemplate() }}
>
  {visibleDesktopPanes().map((pane, idx, arr) => (
    <div key={pane} className="relative min-h-0 overflow-hidden">
      <div className="h-full min-h-0 p-4 overflow-y-auto">
        {pane === 'scripture' && renderScripturePane(block)}
        {pane === 'notes' && renderNotesPane(block)}
        {pane === 'research' && renderResearchPane(block)}
      </div>

      {idx < arr.length - 1 && (
        <div
          onMouseDown={(e) => startResize(pane, arr[idx + 1], e.clientX)}
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize group z-10"
          title="Resize panes"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-slate-200 group-hover:bg-violet-300" />
        </div>
      )}
    </div>
  ))}
</div>

              <div className="md:hidden p-4 flex-1 min-h-0 overflow-y-auto">
                {mobileTab === 'scripture' && renderScripturePane(block)}
                {mobileTab === 'notes' && renderNotesPane(block)}
                {mobileTab === 'research' && renderResearchPane(block)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── ResearchItem ──────────────────────────────────────────────────────────────

function ResearchItem({
  item,
  pending,
  onPlace,
  allowPlace = true,
  selectable = false,
  onToggleFlag,
}: {
  item: InsightItem
  pending: Props['pending']
  onPlace: () => void
  allowPlace?: boolean
  selectable?: boolean
  onToggleFlag?: (flagged: boolean) => void
}) {
  const isPending = pending?.content?.startsWith(item.title || item.content.slice(0, 20))
  const isChecked = !!item.is_flagged

  return (
    <div
      onClick={selectable ? () => onToggleFlag?.(!isChecked) : undefined}
      className={`group border-l-2 pl-3 rounded-r-lg py-1 transition-colors ${
        selectable
          ? isChecked
            ? 'cursor-pointer border-violet-200 bg-violet-50'
            : 'cursor-pointer border-slate-100 hover:border-slate-200 hover:bg-slate-50'
          : item.is_flagged
            ? 'border-slate-400 bg-slate-50'
            : 'border-slate-100 hover:border-slate-200'
      }`}
    >
      <div className="flex items-center gap-1 shrink-0 mb-1">
        {selectable && (
          <span
            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
              isChecked ? 'bg-violet-600 border-violet-600' : 'border-slate-300 bg-white'
            }`}
          >
            {isChecked && <span className="w-2 h-2 text-white font-bold text-[9px] leading-none">✓</span>}
          </span>
        )}

        {allowPlace && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPlace()
            }}
            className={`w-5 h-5 flex items-center justify-center rounded transition-all ${
              isPending ? 'text-violet-600 bg-violet-100' : 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'
            }`}
            title="Place in outline"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}

        {!selectable && (
          <>
            <span className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold ${
              item.is_flagged ? 'bg-slate-200 text-slate-600' : ''
            }`}>
              {item.is_flagged ? '✓' : ''}
            </span>
            <span className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold ${
              (item.used_count ?? 0) > 0 ? 'bg-violet-100 text-violet-500' : ''
            }`}>
              {(item.used_count ?? 0) > 0 ? `${item.used_count}×` : ''}
            </span>
          </>
        )}

        {selectable && (item.used_count ?? 0) > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded-full">
            {item.used_count}×
          </span>
        )}
      </div>

      {item.title && (
        item.title.includes('|') || (item as any).metadata?.word ? (
          <WordStudyTitle title={item.title} metadataWord={(item as any).metadata?.word as string | undefined} />
        ) : (
          <p className="text-xs font-semibold text-slate-700 mb-0.5">{item.title}</p>
        )
      )}
      <p className="text-sm text-slate-600 leading-relaxed">{item.content}</p>

      {item.source_url && (
        <a
          href={item.source_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-block mt-1 text-xs text-violet-600 hover:text-violet-800 underline"
        >
          {item.source_label || 'Source'}
        </a>
      )}
    </div>
  )
}

function WordStudyTitle({ title, metadataWord }: { title: string; metadataWord?: string }) {
  const parsed = parseWordStudyTitle(title, metadataWord)
  if (!parsed.original) return <p className="text-xs font-semibold text-slate-700 mb-0.5">{parsed.fallbackTitle}</p>
  return (
    <div className="flex flex-wrap items-baseline gap-1.5 mb-0.5">
      {parsed.english && <span className="text-xs font-semibold text-slate-700">{parsed.english}</span>}
      {parsed.english && <span className="text-xs text-slate-400">|</span>}
      <span className="text-sm font-bold text-slate-800">{parsed.original}</span>
      {parsed.transliteration && <span className="text-xs text-slate-500 italic">{parsed.transliteration}</span>}
    </div>
  )
}

// ── Auto-resize textarea ──────────────────────────────────────────────────────

function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
  className,
  onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  onKeyDown?: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      rows={2}
      onChange={e => {
        onChange(e.target.value)
        const el = e.currentTarget
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight}px`
      }}
      placeholder={placeholder}
      className={className}
      onKeyDown={onKeyDown}
    />
  )
}

// ── ManualSectionEditor ───────────────────────────────────────────────────────

interface DraftSection {
  id:         number
  label:      string
  startVerse: string
  endVerse:   string
}

function ManualSectionEditor({
  verses,
  initialSections = [],
  hasHeaders = false,
  onSave,
  onCancel,
}: {
  verses: VerseData[]
  initialSections?: SectionHeader[]
  hasHeaders?: boolean
  onSave: (sections: SectionHeader[]) => Promise<void>
  onCancel?: () => void
}) {
  const [saving, setSaving] = useState(false)

  function parseRef(ref: string) {
    const m = ref.match(/^(.+)\s(\d+):(\d+)$/)
    if (!m) return null
    return { book: m[1], chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) }
  }

  const sortedVerses = [...verses].sort((a, b) => {
    const pa = parseRef(a.verse_ref)
    const pb = parseRef(b.verse_ref)
    if (!pa || !pb) return 0
    if (pa.chapter !== pb.chapter) return pa.chapter - pb.chapter
    return pa.verse - pb.verse
  })

  function inferEndVerse(source: SectionHeader[], index: number): string {
    const explicitEnd = source[index]?.endVerse
    if (explicitEnd) return explicitEnd
    const nextStart = source[index + 1]?.startVerse
    if (nextStart) {
      const nextIdx = sortedVerses.findIndex(v => v.verse_ref === nextStart)
      return nextIdx > 0 ? sortedVerses[nextIdx - 1]?.verse_ref ?? '' : ''
    }
    return sortedVerses[sortedVerses.length - 1]?.verse_ref ?? ''
  }

  function buildDraftSections(source: SectionHeader[] = []): DraftSection[] {
    if (!source.length) return []
    return source.map((section, index) => ({
      id: index + 1,
      label: section.label ?? '',
      startVerse: section.startVerse ?? '',
      endVerse: inferEndVerse(source, index),
    }))
  }

  const [sections, setSections] = useState<DraftSection[]>(() => buildDraftSections(initialSections))
  const [nextId, setNextId] = useState(() => buildDraftSections(initialSections).length + 1)

  useEffect(() => {
    const nextDrafts = buildDraftSections(initialSections)
    setSections(nextDrafts)
    setNextId(nextDrafts.length + 1)
  }, [initialSections, verses])

  function addSection() {
    const last = sections[sections.length - 1]
    let defaultStart = ''

    if (sections.length === 0) {
      defaultStart = sortedVerses[0]?.verse_ref ?? ''
    } else if (last?.endVerse) {
      const lastEndIdx = sortedVerses.findIndex(v => v.verse_ref === last.endVerse)
      defaultStart = sortedVerses[lastEndIdx + 1]?.verse_ref ?? ''
    }

    const startIdx = defaultStart ? sortedVerses.findIndex(v => v.verse_ref === defaultStart) : -1
    const defaultEnd = startIdx >= 0 ? sortedVerses[startIdx + 1]?.verse_ref ?? '' : ''
    const id = nextId
    setNextId(n => n + 1)
    setSections(prev => [...prev, { id, label: '', startVerse: defaultStart, endVerse: defaultEnd }])
  }

  function removeSection(id: number) {
    setSections(prev => prev.filter(section => section.id !== id))
  }

  function updateSection(id: number, field: keyof DraftSection, value: string) {
    setSections(prev => prev.map(section => section.id === id ? { ...section, [field]: value } : section))
  }

  function getOverlaps(): Set<number> {
    const overlapping = new Set<number>()
    for (let i = 0; i < sections.length; i++) {
      for (let j = i + 1; j < sections.length; j++) {
        const a = sections[i]
        const b = sections[j]
        if (!a.startVerse || !b.startVerse) continue
        const aStartIdx = sortedVerses.findIndex(v => v.verse_ref === a.startVerse)
        const aEndIdx = a.endVerse ? sortedVerses.findIndex(v => v.verse_ref === a.endVerse) : sortedVerses.length - 1
        const bStartIdx = sortedVerses.findIndex(v => v.verse_ref === b.startVerse)
        const bEndIdx = b.endVerse ? sortedVerses.findIndex(v => v.verse_ref === b.endVerse) : sortedVerses.length - 1
        if (aStartIdx <= bEndIdx && bStartIdx <= aEndIdx) {
          overlapping.add(a.id)
          overlapping.add(b.id)
        }
      }
    }
    return overlapping
  }

  function uncoveredCount(): number {
    const covered = new Set<string>()
    for (const section of sections) {
      if (!section.startVerse) continue
      const startIdx = sortedVerses.findIndex(v => v.verse_ref === section.startVerse)
      const endIdx = section.endVerse ? sortedVerses.findIndex(v => v.verse_ref === section.endVerse) : -1
      const end = endIdx >= 0 ? endIdx : startIdx
      for (let i = startIdx; i <= end && i < sortedVerses.length; i++) {
        if (i >= 0) covered.add(sortedVerses[i].verse_ref)
      }
    }
    return sortedVerses.length - covered.size
  }

  async function handleSave() {
    const valid = sections.filter(section => section.label.trim() && section.startVerse)
    if (!valid.length) return
    setSaving(true)
    await onSave(valid.map(section => ({
      label: section.label.trim(),
      startVerse: section.startVerse,
      endVerse: section.endVerse || undefined,
    })))
    setSaving(false)
  }

  function VersePicker({
    value,
    onChange,
    label,
    filterFrom,
  }: {
    value: string
    onChange: (v: string) => void
    label: string
    filterFrom?: string
  }) {
    const fromIdx = filterFrom ? sortedVerses.findIndex(v => v.verse_ref === filterFrom) : -1
    const options = fromIdx >= 0 ? sortedVerses.slice(fromIdx + 1) : sortedVerses

    function shortLabel(ref: string) {
      const parsed = parseRef(ref)
      if (!parsed) return ref
      return `${parsed.chapter}:${parsed.verse}`
    }

    return (
      <div className="flex flex-col gap-0.5 w-20 shrink-0">
        <span className="text-[10px] text-slate-400 font-medium">{label}</span>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-1.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300 bg-white w-full"
        >
          {!value && <option value="">—</option>}
          {options.map(v => (
            <option key={v.verse_ref} value={v.verse_ref}>{shortLabel(v.verse_ref)}</option>
          ))}
        </select>
      </div>
    )
  }

  const overlaps = getOverlaps()
  const skipped = uncoveredCount()
  const canSave = sections.some(section => section.label.trim() && section.startVerse)
  const title = hasHeaders ? 'Review pericopes' : 'Define pericopes'
  const description = hasHeaders
    ? 'ESV section headers were loaded as your default breakdown. Use them as is or adjust the labels and ranges.'
    : 'No ESV section headers were found. Name each section and set its verse range.'

  return (
    <div className="flex flex-col gap-3 p-4 max-w-5xl w-full mx-auto">
      <div className="max-w-4xl mx-auto w-full">
        <p className="text-sm font-semibold text-slate-700 mb-0.5">{title}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>

      {sections.length === 0 && (
        <div className="max-w-4xl mx-auto w-full flex flex-col items-center justify-center py-8 border border-dashed border-slate-200 rounded-xl gap-2">
          <p className="text-xs text-slate-400">No sections yet</p>
          <button
            onClick={addSection}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />Add pericope
          </button>
        </div>
      )}

      <div className="space-y-2 max-w-4xl mx-auto w-full">
        {sections.map(section => {
          const hasOverlap = overlaps.has(section.id)
          return (
            <div
              key={section.id}
              className={`border rounded-xl px-3 py-2.5 bg-white transition-colors ${
                hasOverlap ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-[280px] flex-[2]">
                  <input
                    className="w-full text-sm border-0 outline-none placeholder:text-slate-300 text-slate-800 bg-transparent"
                    placeholder="Section name (e.g. The Arrival)"
                    value={section.label}
                    autoFocus
                    onChange={e => updateSection(section.id, 'label', e.target.value)}
                  />
                  {hasOverlap && (
                    <p className="text-[10px] text-amber-600 font-medium mt-0.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />Overlaps with another section
                    </p>
                  )}
                </div>

                <div className="flex items-end gap-2">
                  <VersePicker
                    label="From"
                    value={section.startVerse}
                    onChange={value => {
                      const fromIdx = sortedVerses.findIndex(v => v.verse_ref === value)
                      const nextVerse = sortedVerses[fromIdx + 1]?.verse_ref ?? ''
                      updateSection(section.id, 'startVerse', value)
                      if (!section.endVerse && nextVerse) updateSection(section.id, 'endVerse', nextVerse)
                    }}
                  />
                  <span className="text-slate-300 text-xs pb-1.5">–</span>
                  <VersePicker
                    label="To"
                    value={section.endVerse}
                    filterFrom={section.startVerse}
                    onChange={value => updateSection(section.id, 'endVerse', value)}
                  />
                </div>

                <button
                  onClick={() => removeSection(section.id)}
                  className="text-slate-300 hover:text-red-400 transition-colors mt-0.5 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {(sections.length > 0 || !!onCancel) && (
        <div className="flex items-center gap-2 max-w-4xl mx-auto w-full">
          <button
            onClick={addSection}
            className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />Add pericope
          </button>
          {skipped > 0 && (
            <span className="text-[11px] text-slate-400 ml-1">
              {skipped} verse{skipped !== 1 ? 's' : ''} not covered
            </span>
          )}
          {onCancel && (
            <button
              onClick={onCancel}
              className="ml-auto text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-40 flex items-center gap-1"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            {hasHeaders ? 'Use sections' : 'Save sections'}
          </button>
        </div>
      )}
    </div>
  )
}
