'use client'
// ── components/teaching/PericopePanel.tsx ────────────────────────────────────
// Section-by-section research panel for narrative passages.
// Scripture spans full width; notes and AI research sit below in two columns.
// Words can be selected directly from the Scripture text for pericope word study.

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  ChevronDown, ChevronRight, Sparkles, Loader2, Check,
  Plus, X, AlertCircle, ArrowUp, ArrowDown, Trash2,
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
} from '@/app/actions/verse-study'
import { toggleInsightFlagAction } from '@/app/actions/verse-study'
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
    [sectionKey]: [...existing, word].slice(0, 8),
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
}: Props) {
  const [expanded,   setExpanded]   = useState<Record<number, boolean>>({ 0: true })
  const [activeTab,  setActiveTab]  = useState<Record<number, CategoryKey>>({})
  const [generating, setGenerating] = useState<Record<number, boolean>>({})
  const [errors,     setErrors]     = useState<Record<number, string>>({})
  const [editMode,   setEditMode]   = useState(false)
  const [selectedWordsBySection, setSelectedWordsBySection] = useState<Record<string, string[]>>({})
  const [showSuggestionsBySection, setShowSuggestionsBySection] = useState<Record<string, boolean>>({})

  const [noteSaveStates, setNoteSaveStates] = useState<Record<string, SaveState>>({})
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [addingNote, setAddingNote] = useState<Record<string, boolean>>({})
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const toggleSection = useCallback((i: number) => {
    setExpanded(p => ({ ...p, [i]: !p[i] }))
  }, [])

  useEffect(() => {
    return () => {
      Object.values(saveTimers.current).forEach(clearTimeout)
    }
  }, [])

  function getSectionInsights(sectionKey: string, cat: CategoryKey): InsightItem[] {
    return insights[sectionKey]?.[cat] ?? []
  }

  function hasSectionResearch(sectionKey: string): boolean {
    return Object.values(insights[sectionKey] ?? {}).some(items => items.length > 0)
  }

  async function handleGenerate(idx: number) {
    const section = sections[idx]
    const sectionVerses = versesForSection(verses, sections, idx)
    if (!sectionVerses.length) return

    const sectionKey = sectionNoteRef(section.startVerse)
    const selectedWords = selectedWordsBySection[sectionKey] ?? []

    setGenerating(p => ({ ...p, [idx]: true }))
    setErrors(p => ({ ...p, [idx]: '' }))

    const result = await generatePericopeInsightsAction(
      sessionId,
      churchId,
      {
        label: section.label,
        startVerse: section.startVerse,
        verses: sectionVerses,
      },
      selectedWords
    )

    setGenerating(p => ({ ...p, [idx]: false }))

    if (result.error) {
      setErrors(p => ({ ...p, [idx]: result.error! }))
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

    setExpanded(p => ({ ...p, [idx]: true }))
    setActiveTab(p => ({ ...p, [idx]: 'context' }))
  }

  async function handleAddNote(noteRef: string) {
    setAddingNote(prev => ({ ...prev, [noteRef]: true }))
    const result = await createVerseNoteAction(sessionId, churchId, noteRef, '')
    setAddingNote(prev => ({ ...prev, [noteRef]: false }))
    if (result.error || !result.note) return

    onVerseNotesChange({
      ...verseNotes,
      [noteRef]: [...(verseNotes[noteRef] ?? []), result.note],
    })
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

  async function handleDeleteNote(noteRef: string, noteId: string) {
    const result = await deleteVerseNoteAction(noteId)
    if (result.error) return

    onVerseNotesChange({
      ...verseNotes,
      [noteRef]: (verseNotes[noteRef] ?? []).filter(n => n.id !== noteId),
    })
  }

  async function handleMoveNote(noteRef: string, noteId: string, direction: 'up' | 'down') {
    const notes = [...(verseNotes[noteRef] ?? [])]
    const idx = notes.findIndex(n => n.id === noteId)
    if (idx === -1) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === notes.length - 1) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    ;[notes[idx], notes[swapIdx]] = [notes[swapIdx], notes[idx]]

    onVerseNotesChange({ ...verseNotes, [noteRef]: notes })
    await reorderVerseNotesAction(notes.map(n => n.id))
  }

  // ── Section setup editor ───────────────────────────────────────────────────
  const showSetupEditor = !setupComplete || editMode
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
          setEditMode(false)
        }}
        onCancel={setupComplete ? () => setEditMode(false) : undefined}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400 font-medium">{sections.length} sections</span>
        <button
          onClick={() => setEditMode(v => !v)}
          className="text-[11px] text-slate-400 hover:text-slate-700 underline"
        >
          {editMode ? 'Cancel' : 'Adjust sections'}
        </button>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto min-h-0">
        {sections.map((section, idx) => {
          const sectionVerses = versesForSection(verses, sections, idx)
          const rangeLabel    = verseRangeLabel(sectionVerses)
          const isExpanded    = expanded[idx] ?? false
          const cat           = activeTab[idx] ?? 'context'
          const isGenerating  = generating[idx] ?? false
          const sectionKey    = sectionNoteRef(section.startVerse)
          const hasResearch   = hasSectionResearch(sectionKey)
          const items         = getSectionInsights(sectionKey, cat)
          const errorMsg      = errors[idx]
          const noteRef       = sectionKey
          const notes         = verseNotes[noteRef] ?? []
          const wordCandidates = buildWordStudySuggestions(sectionVerses)
          const selectedWords = selectedWordsBySection[sectionKey] ?? []
          const showSuggestions = showSuggestionsBySection[sectionKey] ?? false

          return (
            <div key={`${section.startVerse}-${idx}`} className="border border-slate-200 rounded-xl overflow-hidden">
              <div
                className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => toggleSection(idx)}
              >
                {isExpanded
                  ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{section.label}</p>
                  <p className="text-[11px] text-slate-400">{rangeLabel}</p>
                </div>
                {notes.some(n => n.content.trim()) && (
                  <span className="text-[10px] text-slate-400 shrink-0">{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
                )}
                {hasResearch && (
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" title="Research generated" />
                )}
                <button
                  onClick={e => { e.stopPropagation(); handleGenerate(idx) }}
                  disabled={isGenerating}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors shrink-0 ${
                    hasResearch
                      ? 'text-slate-400 hover:text-violet-600 hover:bg-violet-50'
                      : 'bg-violet-50 text-violet-600 hover:bg-violet-100'
                  }`}
                >
                  {isGenerating
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Sparkles className="w-3 h-3" />}
                  {isGenerating ? 'Generating…' : hasResearch ? 'Regen' : 'Generate'}
                </button>
              </div>

              {isExpanded && (
                <div className="px-3 pb-3 pt-2">
                  {errorMsg && (
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded-lg mb-3 text-xs text-red-700">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {errorMsg}
                    </div>
                  )}

                  {/* Scripture full width */}
                  <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-amber-100">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Scripture
                      </span>
                      {selectedWords.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedWordsBySection(prev => ({ ...prev, [sectionKey]: [] }))}
                          className="text-[11px] text-slate-400 hover:text-slate-700"
                        >
                          Clear selected words
                        </button>
                      )}
                    </div>
                    <div className="px-3 py-2">
                      {sectionVerses.map(v => (
                        <p key={v.verse_ref} className="text-sm text-slate-700 leading-7">
                          <span className="text-xs font-bold text-slate-400 mr-1">{v.verse_ref}</span>
                          {renderSelectableVerseText(v.text, selectedWords, (word) =>
  setSelectedWordsBySection(prev => toggleSelectedWord(prev, sectionKey, word))
)}
                        </p>
                      ))}
                    </div>
                  </div>

                  {/* Notes + AI below */}
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    {/* Notes: left 1/3 */}
                    <div className="xl:col-span-1">
                      <div className="rounded-xl border border-slate-200 bg-white h-full">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</span>
                          <button
                            onClick={() => handleAddNote(noteRef)}
                            disabled={addingNote[noteRef]}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-50"
                          >
                            {addingNote[noteRef]
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Plus className="w-3.5 h-3.5" />}
                            Add note
                          </button>
                        </div>

                        <div className="p-3 space-y-2">
                          {notes.length === 0 ? (
                            <p className="text-xs text-slate-300">Add your observations for this section here.</p>
                          ) : notes.map((note, noteIdx) => {
                            const draft = noteDrafts[note.id] ?? note.content
                            const saveState = noteSaveStates[note.id] ?? 'idle'
                            const isPending = pending?.id === note.id

                            return (
                              <div key={note.id} className="group relative">
                                <div className={`flex items-start gap-2 p-2.5 rounded-xl border transition-colors ${
                                  saveState === 'error'
                                    ? 'border-red-200 bg-red-50'
                                    : 'border-slate-100 bg-slate-50 focus-within:border-slate-300 focus-within:bg-white'
                                }`}>
                              <div className="flex flex-col items-center gap-0.5 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
  <button
    onClick={() => handleMoveNote(noteRef, note.id, 'up')}
    disabled={noteIdx === 0}
    className="p-0.5 rounded text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors"
  >
    <ArrowUp className="w-3 h-3" />
  </button>
  <button
    onClick={() => handleMoveNote(noteRef, note.id, 'down')}
    disabled={noteIdx === notes.length - 1}
    className="p-0.5 rounded text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors"
  >
    <ArrowDown className="w-3 h-3" />
  </button>

  {note.used_count > 0 && (
    <span className="mt-1 text-[10px] font-semibold px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded-full">
      {note.used_count}×
    </span>
  )}
</div>

                                  <AutoResizeTextarea
                                    value={draft}
                                    onChange={val => handleNoteChange(note.id, val)}
                                    placeholder="Write your observation…"
                                    className="flex-1 text-sm text-slate-700 bg-transparent resize-none focus:outline-none placeholder:text-slate-300 leading-relaxed min-h-[40px]"
                                  />

                                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                    <button
                                      onClick={() => onItemPlaced({
                                        id: note.id,
                                        content: draft.trim() || note.content,
                                        type: 'sub_point',
                                        source: 'note',
                                      })}
                                      className={`p-1 rounded transition-colors ${
                                        isPending ? 'text-violet-600 bg-violet-100' : 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'
                                      }`}
                                      title="Place in outline"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>

                                    {saveState === 'saving' && <Loader2 className="w-3 h-3 text-slate-300 animate-spin" />}
                                    {saveState === 'saved' && <Check className="w-3 h-3 text-emerald-500" strokeWidth={2.5} />}
                                    {saveState === 'error' && <AlertCircle className="w-3 h-3 text-red-400" />}

                                    <button
                                      onClick={() => handleDeleteNote(noteRef, note.id)}
                                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* AI Research: right 2/3 */}
                    <div className="xl:col-span-2">
                      <div className="rounded-xl border border-slate-200 bg-white h-full">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">AI Research</span>
                          {!hasResearch && !isGenerating && (
                            <span className="text-[11px] text-slate-300">Not generated yet</span>
                          )}
                        </div>

                        <div className="p-3">
                          <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                                Word Study Focus
                              </span>
                              <div className="flex items-center gap-2">
                                {selectedWords.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedWordsBySection(prev => ({ ...prev, [sectionKey]: [] }))}
                                    className="text-[11px] text-slate-400 hover:text-slate-700"
                                  >
                                    Clear
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setShowSuggestionsBySection(prev => ({ ...prev, [sectionKey]: !showSuggestions }))}
                                  className="text-[11px] text-violet-600 hover:text-violet-800"
                                >
                                  {showSuggestions ? 'Hide suggestions' : 'Suggested words'}
                                </button>
                              </div>
                            </div>

                            {selectedWords.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {selectedWords.map(word => (
                                  <button
                                    key={word}
                                    type="button"
                                    onClick={() => setSelectedWordsBySection(prev => toggleSelectedWord(prev, sectionKey, word))}
                                    className="px-2 py-1 rounded-full text-[11px] border bg-violet-100 border-violet-300 text-violet-700"
                                  >
                                    {word}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-300 mb-2">
                                Click words directly in the Scripture text above to focus the word study.
                              </p>
                            )}

                            {showSuggestions && (
                              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200">
                                {wordCandidates.length === 0 ? (
                                  <p className="text-xs text-slate-300">No strong suggestions detected for this section.</p>
                                ) : wordCandidates.map(word => {
                                  const selected = selectedWords.some(w => normalizeStudyWord(w) === normalizeStudyWord(word))
                                  return (
                                    <button
                                      key={word}
                                      type="button"
                                      onClick={() => setSelectedWordsBySection(prev => toggleSelectedWord(prev, sectionKey, word))}
                                      className={`px-2 py-1 rounded-full text-[11px] border transition-colors ${
                                        selected
                                          ? 'bg-violet-100 border-violet-300 text-violet-700'
                                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                                      }`}
                                    >
                                      {word}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 flex-wrap mb-3">
                            {CATEGORIES.map(c => {
                              const catItems = getSectionInsights(sectionKey, c.key)
                              const isActive = cat === c.key
                              return (
                                <button
                                  key={c.key}
                                  onClick={() => setActiveTab(p => ({ ...p, [idx]: c.key }))}
                                  className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors ${
                                    isActive
                                      ? 'bg-slate-900 text-white'
                                      : catItems.length
                                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        : 'text-slate-300'
                                  }`}
                                >
                                  {c.label}
                                  {catItems.length > 0 && (
                                    <span className={`ml-1 text-[10px] ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                                      {catItems.length}
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>

                          {isGenerating ? (
                            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Generating research for this section…
                            </div>
                          ) : items.length === 0 ? (
                            <p className="text-xs text-slate-300 py-2">
                              Generate research for this section when your notes are ready.
                            </p>
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
        [sectionKey]: {
          ...(insights[sectionKey] ?? {}),
          [cat]: (insights[sectionKey]?.[cat] ?? []).map((it, idx) =>
            idx === i ? { ...it, is_flagged: newFlagged } : it
          ),
        },
      })

      toggleInsightFlagAction(sessionId, sectionKey, cat, i, newFlagged).catch(() => null)
    }}
    onPlace={() => {
      const content = item.title ? `${item.title} — ${item.content}` : item.content
      onItemPlaced({
        id: `${sectionKey}-${cat}-${i}`,
        content,
        type: cat === 'application' ? 'application' : cat === 'practical' ? 'illustration' : 'sub_point',
        source: 'research',
      })
    }}
  />
))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
        <p className="text-xs font-semibold text-slate-700 mb-0.5">{item.title}</p>
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

// ── Auto-resize textarea ──────────────────────────────────────────────────────

function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
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
