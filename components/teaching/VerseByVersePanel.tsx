'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sparkles, BookOpen, AlertCircle, Loader2, ChevronDown, ChevronUp,
  Check, Plus, Trash2, GripVertical, ArrowUp, ArrowDown, MessageSquare, X,
} from 'lucide-react'
import { PericopePanel } from './PericopePanel'
import {
  fetchVerseDataAction,
  generateVerseInsightsAction,
  toggleInsightFlagAction,
  createVerseNoteAction,
  updateVerseNoteAction,
  deleteVerseNoteAction,
  reorderVerseNotesAction,
  updateStudyModeAction,
  setScriptureRefAction,
  fetchPassageHeadersAction,
} from '@/app/actions/verse-study'
import type { VerseData } from '@/lib/esv'
import { StepIndicator } from './StepIndicator'
import type { StepState } from './TeachingWorkspace'
import type { OutlineBlock, VerseNote } from '@/types/database'
import type { PendingItem } from './TeachingWorkspace'

const CATEGORIES = [
  { key: 'word_study',            label: 'Word Study' },
  { key: 'cross_refs',            label: 'Xref' },
  { key: 'practical',             label: 'Analogies' },
  { key: 'theology_by_tradition', label: 'Tradition' },
  { key: 'context',               label: 'Context' },
  { key: 'application',           label: 'Application' },
  { key: 'quotes',                label: 'Quotes' },
] as const

type CategoryKey = typeof CATEGORIES[number]['key']
type Insights = Record<string, Record<string, { title: string; content: string; is_flagged?: boolean; used_count?: number }[]>>
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  sessionId: string
  churchId: string
  scriptureRef: string | null
  hasValidAIKey: boolean
  flowStructure?: { type: string; label: string }[]
  estimatedDuration: number | null

  verses: VerseData[] | null
  insights: Insights
  verseNotes: Record<string, VerseNote[]>
  onVersesChange: (v: VerseData[]) => void
  onInsightsChange: (i: Insights) => void
  onVerseNotesChange: (n: Record<string, VerseNote[]>) => void
  onOutlineGenerated: (blocks: OutlineBlock[]) => void
  onPendingItem: (item: PendingItem) => void
  pendingItemId: string | null
  steps: StepState[]

  pericopeMode: 'vbv' | 'pericope'
  onPericopeModeChange: (m: 'vbv' | 'pericope') => void
  pericopeSections: Array<{ label: string; startVerse: string }>
  onPericopeSectionsChange: (s: Array<{ label: string; startVerse: string }>) => void
  hasSectionHeaders: boolean
  onHasSectionHeadersChange: (value: boolean) => void

  pericopeSetupComplete: boolean
  onPericopeSetupCompleteChange: (complete: boolean) => void

  onScriptureRefSet: (ref: string) => void
  focusMode: boolean
  activeSectionIdx: number
  onActiveSectionChange: (idx: number) => void
  paneVisibility: { scripture: boolean; notes: boolean; research: boolean }
}

export function VerseByVersePanel({
  sessionId,
  churchId,
  scriptureRef,
  hasValidAIKey,
  flowStructure,
  estimatedDuration,
  verses,
  insights,
  verseNotes,
  onVersesChange,
  onInsightsChange,
  onVerseNotesChange,
  onOutlineGenerated,
  onPendingItem,
  pendingItemId,
  steps,
  pericopeMode,
  onPericopeModeChange,
  pericopeSections,
  onPericopeSectionsChange,
  hasSectionHeaders,
  onHasSectionHeadersChange,
  pericopeSetupComplete,
  onPericopeSetupCompleteChange,
  onScriptureRefSet,
  focusMode,
  activeSectionIdx,
  onActiveSectionChange,
  paneVisibility,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<Record<string, CategoryKey>>({})
  const [collapsed,      setCollapsed]      = useState<Set<string>>(new Set())
  const PERICOPE_THRESHOLD = 6
  const [localRef,  setLocalRef]  = useState('')
  const [savingRef, setSavingRef] = useState(false)
  const [refError,  setRefError]  = useState<string | null>(null)

  const [loadingEsv,   setLoadingEsv]   = useState(false)
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  const [generating,   setGenerating]   = useState(false)
  const [genError,     setGenError]     = useState<string | null>(null)

  // Per-note save state: noteId → SaveState
  const [noteSaveStates, setNoteSaveStates] = useState<Record<string, SaveState>>({})
  // Draft content per note while user is typing (before save)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  // Notes being created (local-only before server returns id)
  const [addingNote, setAddingNote] = useState<Record<string, boolean>>({})
  

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Word selection: verse_ref → Set of selected words (max 5 per verse)
  const [selectedWords, setSelectedWords] = useState<Record<string, string[]>>({})
  const [wordLimitNotice, setWordLimitNotice] = useState<Record<string, boolean>>({})


  const hasEsv      = !!verses?.length
  const hasInsights = Object.keys(insights).length > 0
  const hasNotes    = Object.values(verseNotes).some(arr => arr.length > 0)
  // ── Word selection ───────────────────────────────────────────────────────────
function toggleWord(verseRef: string, word: string) {
  setSelectedWords(prev => {
    const current = prev[verseRef] ?? []

    if (current.includes(word)) {
      setWordLimitNotice(notices => ({ ...notices, [verseRef]: false }))
      return { ...prev, [verseRef]: current.filter(w => w !== word) }
    }

    if (current.length >= 5) {
      setWordLimitNotice(notices => ({ ...notices, [verseRef]: true }))
      return prev
    }

    setWordLimitNotice(notices => ({ ...notices, [verseRef]: false }))
    return { ...prev, [verseRef]: [...current, word] }
  })
}

  function cleanWord(raw: string): string {
    return raw.replace(/[^a-zA-Z'-]/g, '').toLowerCase()
  }

  // ── Set scripture ref + load ────────────────────────────────────────────────
  async function handleSetRef(mode: 'vbv' | 'pericope') {
    const trimmed = localRef.trim()
    if (!trimmed) { setRefError('Enter a scripture reference.'); return }
    setSavingRef(true); setRefError(null)
    const result = await setScriptureRefAction(sessionId, trimmed)
    if (result.error) { setRefError(result.error); setSavingRef(false); return }
    onScriptureRefSet(trimmed)
    await handleFetchEsv(mode, trimmed)
    setSavingRef(false)
  }

  // ── Load ESV ────────────────────────────────────────────────────────────────
  async function handleFetchEsv(mode: 'vbv' | 'pericope' = 'vbv', refOverride?: string) {
    const ref = refOverride ?? scriptureRef
    if (!ref) return
    // Persist the grouping choice before loading
    if (mode !== pericopeMode) {
      onPericopeModeChange(mode)
      await updateStudyModeAction(sessionId, mode)
    }
    setLoadingEsv(true); setFetchError(null)
    const result = await fetchVerseDataAction(sessionId, ref)
    setLoadingEsv(false)
    if (result.error) { setFetchError(result.error); return }
    if (result.verses) onVersesChange(result.verses)
    onInsightsChange(result.insights)
    onVerseNotesChange(result.verseNotes)

      // If pericope mode, only load headers when no saved sections exist yet.
      if (mode === 'pericope') {
        const hasSavedSections = pericopeSections.length > 0
  
        if (hasSavedSections) {
          onPericopeSetupCompleteChange(true)
        } else {
          onPericopeSetupCompleteChange(false)
          onHasSectionHeadersChange(false)
          onPericopeSectionsChange([])
  
          const headers = await fetchPassageHeadersAction(ref)
          if (!headers.error) {
            onPericopeSectionsChange(headers.sections)
            onHasSectionHeadersChange(headers.hasHeaders)
          }
        }
      }
  }

  // ── Note: create ─────────────────────────────────────────────────────────────
  async function handleAddNote(verseRef: string) {
    setAddingNote(prev => ({ ...prev, [verseRef]: true }))
    const result = await createVerseNoteAction(sessionId, churchId, verseRef, '')
    setAddingNote(prev => ({ ...prev, [verseRef]: false }))
    if (result.error || !result.note) return
    onVerseNotesChange({
      ...verseNotes,
      [verseRef]: [...(verseNotes[verseRef] ?? []), result.note],
    })
  }

  // ── Note: update (auto-save) ──────────────────────────────────────────────────
  function handleNoteChange(noteId: string, value: string) {
    setNoteDrafts(prev => ({ ...prev, [noteId]: value }))
    setNoteSaveStates(prev => ({ ...prev, [noteId]: 'saving' }))

    if (saveTimers.current[noteId]) clearTimeout(saveTimers.current[noteId])
    saveTimers.current[noteId] = setTimeout(async () => {
      const result = await updateVerseNoteAction(noteId, value)
      setNoteSaveStates(prev => ({ ...prev, [noteId]: result.error ? 'error' : 'saved' }))
      // Update lifted state with saved content
      onVerseNotesChange(
        Object.fromEntries(
          Object.entries(verseNotes).map(([vRef, notes]) => [
            vRef,
            notes.map(n => n.id === noteId ? { ...n, content: value } : n),
          ])
        )
      )
      // Clear 'saved' indicator after 2s
      if (!result.error) {
        setTimeout(() => setNoteSaveStates(prev => ({ ...prev, [noteId]: 'idle' })), 2000)
      }
    }, 700)
  }

  // ── Note: delete ─────────────────────────────────────────────────────────────
  async function handleDeleteNote(verseRef: string, noteId: string) {
    const result = await deleteVerseNoteAction(noteId)
    if (result.error) return
    onVerseNotesChange({
      ...verseNotes,
      [verseRef]: (verseNotes[verseRef] ?? []).filter(n => n.id !== noteId),
    })
  }

  // ── Note: move up/down ────────────────────────────────────────────────────────
  async function handleMoveNote(verseRef: string, noteId: string, direction: 'up' | 'down') {
    const notes = [...(verseNotes[verseRef] ?? [])]
    const idx = notes.findIndex(n => n.id === noteId)
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === notes.length - 1) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    ;[notes[idx], notes[swapIdx]] = [notes[swapIdx], notes[idx]]

    onVerseNotesChange({ ...verseNotes, [verseRef]: notes })
    await reorderVerseNotesAction(notes.map(n => n.id))
  }

  // ── Generate insights ─────────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true); setGenError(null)
    const result = await generateVerseInsightsAction(sessionId, churchId, selectedWords)
    if (result.error) { setGenError(result.error); setGenerating(false); return }
    // Reload from DB — AI saves before we display
    if (scriptureRef) {
      const data = await fetchVerseDataAction(sessionId, scriptureRef)
      if (!data.error) {
        if (data.verses) onVersesChange(data.verses)
        onInsightsChange(data.insights)
        onVerseNotesChange(data.verseNotes)
      }
    }
    setGenerating(false)
  }

  // (Generate outline moved to Outline view → Assistance → Draft Outline)

  function toggleCollapse(ref: string) {
    setCollapsed(prev => { const n = new Set(prev); n.has(ref) ? n.delete(ref) : n.add(ref); return n })
  }

  if (!scriptureRef) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <BookOpen className="w-10 h-10 text-slate-200" />
        <div className="w-full max-w-sm text-left">
          <p className="text-sm font-semibold text-slate-700 mb-3 text-center">Add Scripture</p>
          <input
            autoFocus
            value={localRef}
            onChange={e => setLocalRef(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !savingRef && handleSetRef('vbv')}
            placeholder="e.g. Mark 11:1-10"
            className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-300 placeholder:text-slate-300 mb-3"
          />
          {refError && (
            <p className="text-xs text-red-500 mb-2">{refError}</p>
          )}
          <p className="text-xs text-slate-400 mb-2 text-center">How do you want to study this passage?</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleSetRef('vbv')}
              disabled={savingRef || !localRef.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              {savingRef ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
              Verse by Verse
            </button>
            <button
              onClick={() => handleSetRef('pericope')}
              disabled={savingRef || !localRef.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              {savingRef ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
              By Section
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0">

      {/* ── Sticky workflow header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-slate-50 pb-4 pt-1">

        {/* Action bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Load buttons — shown when ref is set but ESV not yet loaded */}
            {!hasEsv && !loadingEsv && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-slate-400">How do you want to study this passage?</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleFetchEsv('vbv')}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-colors"
                  >
                    <BookOpen className="w-4 h-4" />Verse by Verse
                  </button>
                  <button
                    onClick={() => handleFetchEsv('pericope')}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <BookOpen className="w-4 h-4" />By Section (Pericope)
                  </button>
                </div>
              </div>
            )}
            {!hasEsv && loadingEsv && (
              <button disabled className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl opacity-50">
                <Loader2 className="w-4 h-4 animate-spin" />Loading…
              </button>
            )}

            {/* Selection controls */}

          </div>


        </div>

        {fetchError   && <ErrorBanner message={fetchError}   />}
        {genError     && <ErrorBanner message={genError}     />}
      </div>



      {/* ── Generating skeleton ───────────────────────────────────────────────── */}
      {generating && (
        <div className="space-y-3 mt-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden animate-pulse">
              <div className="px-5 py-3 border-b border-slate-100"><div className="h-3 w-20 bg-slate-100 rounded" /></div>
              <div className="grid grid-cols-[44fr_56fr] divide-x divide-slate-100">
                <div className="p-5 space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-full" />
                  <div className="h-3 bg-slate-100 rounded w-4/5" />
                  <div className="h-16 bg-slate-50 rounded-xl mt-3" />
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex gap-1">{[1,2,3].map(j=><div key={j} className="h-6 w-14 bg-slate-100 rounded-lg"/>)}</div>
                  <div className="h-3 bg-slate-100 rounded w-full"/>
                  <div className="h-3 bg-slate-100 rounded w-3/4"/>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Column headers ─────────────────────────────────────────────────────── */}
      {hasEsv && !generating && pericopeMode === 'vbv' && (
        <div className="grid grid-cols-[44fr_56fr] gap-0 mb-2 px-1">
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Verse · Notes</span>
          </div>
          <div className="flex items-center justify-between gap-2 pl-5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Research
                {hasInsights && <span className="text-slate-300 font-normal normal-case tracking-normal"> · check to include in outline</span>}
              </span>
            </div>
            {hasEsv && hasValidAIKey && (
              <button onClick={handleGenerate} disabled={generating}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-500 hover:text-violet-600 hover:bg-violet-50 border border-slate-200 hover:border-violet-200 rounded-lg transition-colors disabled:opacity-40 shrink-0">
                {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {generating ? 'Generating…' : hasInsights ? 'Regenerate' : 'Generate'}
              </button>
            )}
          </div>
        </div>
      )}



      {/* ── Pericope panel ───────────────────────────────────────────────────── */}
      {pericopeMode === 'pericope' && verses && (
       <PericopePanel
       sessionId={sessionId}
       churchId={churchId}
       verses={verses}
       sections={pericopeSections}
       hasHeaders={hasSectionHeaders || pericopeSections.length > 0}
       setupComplete={pericopeSetupComplete}
       onSetupCompleteChange={onPericopeSetupCompleteChange}
       insights={insights}
       onInsightsChange={onInsightsChange}
       onSectionsChange={onPericopeSectionsChange}
       verseNotes={verseNotes}
      onVerseNotesChange={onVerseNotesChange}
       pending={null}
       focusMode={focusMode}
       activeSectionIdx={activeSectionIdx}
       onActiveSectionChange={onActiveSectionChange}
       paneVisibility={paneVisibility}
       onItemPlaced={(item) =>
         onPendingItem({
           sourceId: item.id,
           content: item.content,
           type: item.type as any,
           sourceKind: item.source === 'note' ? 'note' : 'research',
         })
       }
     />
      )}

      {/* ── Verse rows (VBV mode only) ──────────────────────────────────────── */}
      {pericopeMode === 'vbv' && !generating && verses?.map((verse: VerseData) => {
        const isCollapsed   = collapsed.has(verse.verse_ref)
        const verseInsights = insights[verse.verse_ref] ?? {}
        const hasAny        = Object.keys(verseInsights).length > 0
        const activeCat: CategoryKey = activeCategory[verse.verse_ref] ?? 'word_study'
        const notes         = verseNotes[verse.verse_ref] ?? []

        return (
          <div key={verse.verse_ref} className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-3">
            {/* Row header */}
            <button onClick={() => toggleCollapse(verse.verse_ref)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors group border-b border-slate-100">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{verse.verse_ref}</span>
              <div className="flex items-center gap-2">
                {notes.length > 0 && (
                  <span className="text-xs text-slate-400">{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
                )}
                {isCollapsed
                  ? <ChevronDown className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
                  : <ChevronUp   className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />}
              </div>
            </button>

            {!isCollapsed && (
              <div className="grid grid-cols-[44fr_56fr] divide-x divide-slate-100">

                {/* ── Left: verse text + notes ────────────────────────── */}
                <div className="p-5">
                  {/* Verse text — tap/click words to select for word study */}
                  <div className="mb-4">
                  <div className="mb-1.5">
  <p className="text-[11px] font-medium text-slate-400">
    {hasEsv && !hasInsights
      ? <>Tap words to request a word study <span className="text-slate-300">(up to 5)</span></>
      : selectedWords[verse.verse_ref]?.length
        ? <span className="text-violet-600">{selectedWords[verse.verse_ref].length} word{selectedWords[verse.verse_ref].length !== 1 ? 's' : ''} selected for study</span>
        : null}
  </p>
  {wordLimitNotice[verse.verse_ref] && (
    <p className="text-[11px] text-amber-600 mt-1">
      Word limit reached. Remove one to select another.
    </p>
  )}
</div>
                    <p className="text-sm text-slate-800 leading-relaxed font-serif">
                      {verse.text.split(/\b/).map((token, i) => {
                        const cleaned = cleanWord(token)
                        if (!cleaned || cleaned.length < 3) return <span key={i}>{token}</span>
                        const isSelected = (selectedWords[verse.verse_ref] ?? []).includes(cleaned)
                        const maxed = (selectedWords[verse.verse_ref]?.length ?? 0) >= 5
                        return (
                          <span
                            key={i}
                            onClick={() => toggleWord(verse.verse_ref, cleaned)}
                            className={`cursor-pointer rounded transition-all ${ 
                              isSelected
                                ? 'bg-violet-200 text-violet-900 font-semibold px-0.5'
                                : maxed
                                  ? 'opacity-50 cursor-default'
                                  : 'hover:bg-violet-50 hover:text-violet-700'
                            }`}
                          >
                            {token}
                          </span>
                        )
                      })}
                    </p>
                  </div>

                  {/* Notes list */}
                  <div className="space-y-2">
                    {notes.map((note, idx) => {
                      const draft     = noteDrafts[note.id] ?? note.content
                      const saveState = noteSaveStates[note.id] ?? 'idle'
                      return (
                        <div key={note.id} className="group relative">
                          <div className={`flex items-start gap-2 p-2.5 rounded-xl border transition-colors ${
                            saveState === 'error' ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50 focus-within:border-slate-300 focus-within:bg-white'
                          }`}>
                            {/* Reorder controls */}
                            <div className="flex flex-col items-center gap-0.5 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
  <button
    onClick={() => handleMoveNote(verse.verse_ref, note.id, 'up')}
    disabled={idx === 0}
    className="p-0.5 rounded text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors"
  >
    <ArrowUp className="w-3 h-3" />
  </button>
  <button
    onClick={() => handleMoveNote(verse.verse_ref, note.id, 'down')}
    disabled={idx === notes.length - 1}
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

                            {/* Note input */}
                            <AutoResizeTextarea
                              value={draft}
                              onChange={val => handleNoteChange(note.id, val)}
                              placeholder="Write your observation…"
                              className="flex-1 text-sm text-slate-700 bg-transparent resize-none focus:outline-none placeholder:text-slate-300 leading-relaxed min-h-[40px]"
                            />

                            {/* Save state + place + delete */}
                            <div className="flex items-center gap-1 shrink-0 mt-0.5">
                              {saveState === 'saving' && <Loader2 className="w-3 h-3 text-slate-300 animate-spin" />}
                              {saveState === 'saved'  && <Check   className="w-3 h-3 text-emerald-500" strokeWidth={2.5} />}
                              {saveState === 'error'  && <AlertCircle className="w-3 h-3 text-red-400" />}

                              <button
                                onClick={() => handleDeleteNote(verse.verse_ref, note.id)}
                                className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Used badge */}

                        </div>
                      )
                    })}
                  </div>

                  {/* Add note button */}
                  <button
                    onClick={() => handleAddNote(verse.verse_ref)}
                    disabled={addingNote[verse.verse_ref]}
                    className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-50"
                  >
                    {addingNote[verse.verse_ref]
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Plus    className="w-3.5 h-3.5" />
                    }
                    Add note
                  </button>
                </div>

                {/* ── Right: research insights ─────────────────────────── */}
                <div className="p-5">
                  {!hasAny ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-center gap-2">
                      <Sparkles className="w-6 h-6 text-slate-200" />
                      <p className="text-xs text-slate-300">
                        {!hasNotes
                          ? 'Add notes first, then generate research'
                          : hasValidAIKey
                            ? 'Click Generate Research above'
                            : 'Add an AI key in Settings'}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Category CATEGORIES */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {CATEGORIES.map(cat => {
                          const items    = verseInsights[cat.key]
                          const has      = items && items.length > 0
                          const isActive = activeCat === cat.key

                          return (
                            <button key={cat.key}
                              onClick={() => setActiveCategory(p => ({ ...p, [verse.verse_ref]: cat.key }))}
                              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                                isActive && has ? 'bg-slate-900 text-white'
                                : isActive && !has ? 'bg-slate-200 text-slate-500'
                                : has ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                              }`}>
                              {cat.label}
                
                            </button>
                          )
                        })}
                      </div>

                      {/* Research items — dig deeper prompt + place-in-outline */}
                      <div className="space-y-2">
                        {(verseInsights[activeCat] ?? []).map((item, i) => (
                          <ResearchItemCard
                            key={i}
                            item={item}
                            category={activeCat}
                            verseRef={verse.verse_ref}
                            itemIndex={i}
                            sessionId={sessionId}
                            onFlagToggle={(newFlagged) => {
                              // Optimistically update insights in place
                              onInsightsChange({
                                ...insights,
                                [verse.verse_ref]: {
                                  ...(insights[verse.verse_ref] ?? {}),
                                  [activeCat]: (insights[verse.verse_ref]?.[activeCat] ?? []).map((it, idx) =>
                                    idx === i ? { ...it, is_flagged: newFlagged } : it
                                  ),
                                },
                              })
                              toggleInsightFlagAction(sessionId, verse.verse_ref, activeCat, i, newFlagged).catch(() => null)
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      
    </div>
  )
}



// ── Dig deeper prompt builder ──────────────────────────────────────────────────
function buildDigDeeperPrompt(item: { title: string; content: string }, category: string, verseRef: string): string {
  const catLabel: Record<string, string> = {
    word_study: 'word study', cross_refs: 'cross-reference', context: 'historical context',
    practical: 'illustration/analogy', theology_by_tradition: 'theological point',
    application: 'application', quotes: 'theologian quote',
  }
  const label = catLabel[category] ?? 'insight'
  const itemDesc = item.title ? `"${item.title}" — ${item.content}` : item.content

  return `I am studying ${verseRef} and came across this ${label}:

${itemDesc}

Please help me go deeper on this by providing:
1. Clarification — explain this more fully in plain language
2. Additional details — what else should I know about this that wasn't mentioned?
3. Differing or opposing views — are there other interpretations or positions on this within orthodox Christianity?
4. Further study — list 3–5 books, commentaries, or academic resources where I can research this topic more deeply

Please be specific and academically grounded in your response.`
}

// ── Research item card ─────────────────────────────────────────────────────────
function ResearchItemCard({
  item, category, verseRef, itemIndex, sessionId, onFlagToggle,
}: {
  item: { title: string; content: string; is_flagged?: boolean; used_count?: number }
  category: string
  verseRef: string
  itemIndex: number
  sessionId: string
  onFlagToggle: (flagged: boolean) => void
}) {
  const isChecked = !!item.is_flagged
  const [copied, setCopied] = useState(false)

  async function handleDigDeeper() {
    const prompt = buildDigDeeperPrompt(item, category, verseRef)
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div
      onClick={() => onFlagToggle(!isChecked)}
      className={`group flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none ${
        isChecked
          ? 'bg-violet-50 border-violet-200'
          : 'bg-slate-50 border-transparent hover:border-slate-200 hover:bg-white'
      }`}
    >
      {/* Checkbox */}
      <span className={`mt-1 shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
        isChecked ? 'bg-violet-600 border-violet-600' : 'border-slate-300 bg-white'
      }`}>
        {isChecked && <span className="w-2 h-2 text-white font-bold text-[9px] leading-none">✓</span>}
      </span>
      <div className="flex-1 min-w-0">
        {item.title && (
          category === 'word_study' ? (
            <WordStudyTitle title={item.title} />
          ) : category === 'quotes' ? (
            <p className="text-xs font-semibold text-slate-500 italic mb-0.5">{item.title}</p>
          ) : (
            <p className="text-xs font-semibold text-slate-700 mb-0.5">{item.title}</p>
          )
        )}
        <p className={`text-sm leading-relaxed ${category === 'quotes' ? 'text-slate-700 italic' : 'text-slate-600'}`}>
          {category === 'quotes' && <span className="text-slate-300 mr-1 text-base">"</span>}
          {item.content}
          {category === 'quotes' && <span className="text-slate-300 ml-1 text-base">"</span>}
        </p>
      </div>
      {/* Action buttons — appear on hover */}
      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); handleDigDeeper() }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title={copied ? 'Prompt copied!' : 'Copy a "dig deeper" prompt to paste into any AI tool'}
        >
          {copied
            ? <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />
            : <MessageSquare className="w-3.5 h-3.5" />}
        </button>

      </div>
    </div>
  )
}

// ── Auto-resize textarea ────────────────────────────────────────────────────────

function AutoResizeTextarea({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
  }, [value])
  return (
    <textarea ref={ref} value={value} rows={2}
      onChange={e => {
        onChange(e.target.value)
        const el = e.currentTarget; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`
      }}
      placeholder={placeholder} className={className} />
  )
}

// ── Error banner ────────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mt-2">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{message}</span>
    </div>
  )
}

// ── Word study title: renders "λόγoς (logos)" with original word prominent ────
function WordStudyTitle({ title }: { title: string }) {
  // Expected format: "originalWord (transliteration)" e.g. "λόγoς (logos)"
  const match = title.match(/^(.+?)\s+\((.+)\)$/)
  if (!match) return <p className="text-xs font-semibold text-slate-700 mb-0.5">{title}</p>
  const [, original, transliteration] = match
  return (
    <div className="flex items-baseline gap-2 mb-1">
      <span className="text-base font-bold text-slate-800 leading-tight">{original}</span>
      <span className="text-xs text-slate-500 font-medium">{transliteration}</span>
    </div>
  )
}
