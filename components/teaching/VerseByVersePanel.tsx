'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sparkles, BookOpen, AlertCircle, Loader2, ChevronDown, ChevronUp,
  Check, ArrowRight, Plus, Trash2, GripVertical, ArrowUp, ArrowDown,
} from 'lucide-react'
import {
  fetchVerseDataAction,
  generateVerseInsightsAction,
  createVerseNoteAction,
  updateVerseNoteAction,
  deleteVerseNoteAction,
  reorderVerseNotesAction,
} from '@/app/actions/verse-study'
import { generateOutlineAction } from '@/app/actions/ai'
import type { VerseData } from '@/lib/esv'
import type { OutlineBlock, VerseNote } from '@/types/database'

const CATEGORIES = [
  { key: 'word_study',            label: 'Word Study' },
  { key: 'cross_refs',            label: 'Cross-refs' },
  { key: 'context',               label: 'Context' },
  { key: 'practical',             label: 'Practical' },
  { key: 'theology_by_tradition', label: 'Tradition' },
  { key: 'application',           label: 'Application' },
] as const

type CategoryKey = typeof CATEGORIES[number]['key']
type Insights = Record<string, Record<string, { title: string; content: string }[]>>
type SelectedKey = string // "verseRef||category||index"

function makeKey(verseRef: string, cat: string, idx: number): SelectedKey {
  return `${verseRef}||${cat}||${idx}`
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  sessionId:          string
  churchId:           string
  scriptureRef:       string | null
  hasValidAIKey:      boolean
  flowStructure?:     { type: string; label: string }[]
  estimatedDuration:  number | null
  // Lifted state from TeachingWorkspace
  verses:             VerseData[] | null
  insights:           Insights
  verseNotes:         Record<string, VerseNote[]>
  onVersesChange:     (v: VerseData[]) => void
  onInsightsChange:   (i: Insights) => void
  onVerseNotesChange: (n: Record<string, VerseNote[]>) => void
  onOutlineGenerated: (blocks: OutlineBlock[]) => void
}

type Step = 'esv' | 'notes' | 'research' | 'outline'

export function VerseByVersePanel({
  sessionId, churchId, scriptureRef, hasValidAIKey,
  flowStructure, estimatedDuration,
  verses, insights, verseNotes,
  onVersesChange, onInsightsChange, onVerseNotesChange,
  onOutlineGenerated,
}: Props) {
  const [selected,       setSelected]       = useState<Set<SelectedKey>>(new Set())
  const [activeCategory, setActiveCategory] = useState<Record<string, CategoryKey>>({})
  const [collapsed,      setCollapsed]      = useState<Set<string>>(new Set())

  const [loadingEsv,   setLoadingEsv]   = useState(false)
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  const [generating,   setGenerating]   = useState(false)
  const [genError,     setGenError]     = useState<string | null>(null)
  const [genOutline,   setGenOutline]   = useState(false)
  const [outlineError, setOutlineError] = useState<string | null>(null)

  // Per-note save state: noteId → SaveState
  const [noteSaveStates, setNoteSaveStates] = useState<Record<string, SaveState>>({})
  // Draft content per note while user is typing (before save)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  // Notes being created (local-only before server returns id)
  const [addingNote, setAddingNote] = useState<Record<string, boolean>>({})

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const hasEsv      = !!verses?.length
  const hasInsights = Object.keys(insights).length > 0
  const hasNotes    = Object.values(verseNotes).some(arr => arr.length > 0)
  const totalItems  = Object.values(insights).reduce(
    (acc, cats) => acc + Object.values(cats).reduce((a, items) => a + items.length, 0), 0
  )
  const selectedCount = selected.size

  const currentStep: Step = !hasEsv ? 'esv' : !hasNotes ? 'notes' : !hasInsights ? 'research' : 'outline'

  // ── Load ESV ────────────────────────────────────────────────────────────────
  async function handleFetchEsv() {
    if (!scriptureRef) return
    setLoadingEsv(true); setFetchError(null)
    const result = await fetchVerseDataAction(sessionId, scriptureRef)
    setLoadingEsv(false)
    if (result.error) { setFetchError(result.error); return }
    if (result.verses) onVersesChange(result.verses)
    onInsightsChange(result.insights)
    onVerseNotesChange(result.verseNotes)
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
    const result = await generateVerseInsightsAction(sessionId, churchId)
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

  // ── Selection ─────────────────────────────────────────────────────────────────
  function toggleItem(key: SelectedKey) {
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function selectAll() {
    const keys: SelectedKey[] = []
    for (const [vRef, cats] of Object.entries(insights))
      for (const [cat, items] of Object.entries(cats))
        items.forEach((_, i) => keys.push(makeKey(vRef, cat, i)))
    setSelected(new Set(keys))
  }
  function clearAll() { setSelected(new Set()) }

  // ── Generate outline ──────────────────────────────────────────────────────────
  async function handleGenerateOutline() {
    setGenOutline(true); setOutlineError(null)
    const selectedInsights: { verseRef: string; category: string; title: string; content: string }[] = []
    Array.from(selected).forEach(key => {
      const [vRef, cat, idxStr] = key.split('||')
      const item = insights[vRef]?.[cat]?.[parseInt(idxStr)]
      if (item) selectedInsights.push({ verseRef: vRef, category: cat, ...item })
    })

    // Bundle notes per verse for AI context
    const notesForAI: Record<string, string> = {}
    for (const [vRef, notes] of Object.entries(verseNotes)) {
      const text = notes.filter(n => n.content.trim()).map(n => n.content).join('\n')
      if (text) notesForAI[vRef] = text
    }

    const result = await generateOutlineAction({
      sessionId, churchId, flowStructure,
      verseNotes: notesForAI,
      selectedInsights,
    })
    setGenOutline(false)
    if (result.error || !result.blocks) { setOutlineError(result.error ?? 'Outline generation failed.'); return }
    onOutlineGenerated(result.blocks)
  }

  function toggleCollapse(ref: string) {
    setCollapsed(prev => { const n = new Set(prev); n.has(ref) ? n.delete(ref) : n.add(ref); return n })
  }

  if (!scriptureRef) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <BookOpen className="w-10 h-10 text-slate-200" />
        <p className="text-sm text-slate-400 max-w-xs">No scripture reference set. Edit the session to add one.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0">

      {/* ── Sticky workflow header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-slate-50 pb-4 pt-1">
        {/* Step indicators */}
        <div className="flex items-center gap-0 mb-3 flex-wrap gap-y-1">
          {([
            { key: 'esv',      label: '1  Load Text',          done: hasEsv },
            { key: 'notes',    label: '2  Add Notes',           done: hasNotes },
            { key: 'research', label: '3  Generate Research',   done: hasInsights },
            { key: 'outline',  label: '4  Generate Outline',    done: false },
          ] as { key: Step; label: string; done: boolean }[]).map((s, i, arr) => (
            <div key={s.key} className="flex items-center">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                s.done
                  ? 'text-emerald-700 bg-emerald-50'
                  : currentStep === s.key
                    ? 'text-slate-900 bg-white border border-slate-200 shadow-sm'
                    : 'text-slate-400'
              }`}>
                {s.done
                  ? <Check className="w-3 h-3 text-emerald-600" strokeWidth={2.5} />
                  : <span className={`w-3 h-3 rounded-full border-2 ${currentStep === s.key ? 'border-slate-700' : 'border-slate-300'}`} />
                }
                {s.label}
              </div>
              {i < arr.length - 1 && <div className="w-4 h-px bg-slate-200 mx-0.5" />}
            </div>
          ))}
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Step 1: Load ESV */}
            {!hasEsv && (
              <button onClick={handleFetchEsv} disabled={loadingEsv}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-colors">
                {loadingEsv ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                {loadingEsv ? 'Loading…' : `Load ${scriptureRef}`}
              </button>
            )}

            {/* Step 3: Generate research (only after notes) */}
            {hasEsv && hasNotes && hasValidAIKey && (
              <button onClick={handleGenerate} disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 disabled:opacity-40 transition-colors">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? 'Generating…' : hasInsights ? 'Regenerate Research' : 'Generate Research'}
              </button>
            )}
            {hasEsv && !hasNotes && hasValidAIKey && (
              <p className="text-xs text-slate-400">Add notes below, then generate research</p>
            )}

            {/* Selection controls */}
            {hasInsights && totalItems > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 ml-1">
                <span className="font-semibold text-slate-700">{selectedCount}/{totalItems}</span>
                <span>selected</span>
                <span className="text-slate-300 mx-0.5">·</span>
                <button onClick={selectAll}  className="text-violet-600 hover:text-violet-800 font-semibold">All</button>
                <span className="text-slate-300">·</span>
                <button onClick={clearAll}   className="text-slate-400 hover:text-slate-600 font-semibold">None</button>
              </div>
            )}
          </div>

          {/* Step 4: Generate outline */}
          {hasInsights && hasValidAIKey && (
            <button onClick={handleGenerateOutline} disabled={genOutline}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-40 transition-colors">
              {genOutline ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {genOutline ? 'Generating Outline…' : 'Generate Outline'}
            </button>
          )}
        </div>

        {fetchError   && <ErrorBanner message={fetchError}   />}
        {genError     && <ErrorBanner message={genError}     />}
        {outlineError && <ErrorBanner message={outlineError} />}
      </div>

      {/* ── Not loaded yet ─────────────────────────────────────────────────────── */}
      {!hasEsv && !loadingEsv && (
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl gap-2 mt-1">
          <BookOpen className="w-8 h-8 text-slate-200" />
          <p className="text-sm text-slate-400">Load the scripture text to begin your study</p>
        </div>
      )}

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
      {hasEsv && !generating && (
        <div className="grid grid-cols-[44fr_56fr] gap-0 mb-2 px-1">
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Verse · Notes</span>
          </div>
          <div className="flex items-center gap-1.5 pl-5">
            <Sparkles className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Research
              {hasInsights && <span className="text-slate-300 font-normal normal-case tracking-normal"> · check to include in outline</span>}
            </span>
          </div>
        </div>
      )}

      {/* ── Verse rows ─────────────────────────────────────────────────────────── */}
      {!generating && verses?.map((verse: VerseData) => {
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
                  {/* Verse text */}
                  <p className="text-sm text-slate-800 leading-relaxed font-serif mb-4">{verse.text}</p>

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
                            <div className="flex flex-col gap-0.5 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleMoveNote(verse.verse_ref, note.id, 'up')}
                                disabled={idx === 0}
                                className="p-0.5 rounded text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors">
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button onClick={() => handleMoveNote(verse.verse_ref, note.id, 'down')}
                                disabled={idx === notes.length - 1}
                                className="p-0.5 rounded text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors">
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Note input */}
                            <AutoResizeTextarea
                              value={draft}
                              onChange={val => handleNoteChange(note.id, val)}
                              placeholder="Write your observation…"
                              className="flex-1 text-sm text-slate-700 bg-transparent resize-none focus:outline-none placeholder:text-slate-300 leading-relaxed min-h-[40px]"
                            />

                            {/* Save state + delete */}
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
                          {note.used_count > 0 && (
                            <span className="absolute -top-1.5 -right-1 text-[10px] font-semibold px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded-full">
                              used {note.used_count}×
                            </span>
                          )}
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
                      {/* Category tabs */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {CATEGORIES.map(cat => {
                          const items    = verseInsights[cat.key]
                          const has      = items && items.length > 0
                          const isActive = activeCat === cat.key
                          const selCount = items
                            ? items.filter((_, i) => selected.has(makeKey(verse.verse_ref, cat.key, i))).length
                            : 0
                          return (
                            <button key={cat.key}
                              onClick={() => setActiveCategory(p => ({ ...p, [verse.verse_ref]: cat.key }))}
                              disabled={!has}
                              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                                isActive ? 'bg-slate-900 text-white'
                                : has ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                : 'bg-slate-50 text-slate-300 cursor-default'
                              }`}>
                              {cat.label}
                              {selCount > 0 && <span className="ml-1 text-[10px] font-bold text-violet-400">{selCount}✓</span>}
                            </button>
                          )
                        })}
                      </div>

                      {/* Selectable items */}
                      <div className="space-y-2">
                        {(verseInsights[activeCat] ?? []).map((item, i) => {
                          const key        = makeKey(verse.verse_ref, activeCat, i)
                          const isSelected = selected.has(key)
                          return (
                            <div key={i} onClick={() => toggleItem(key)}
                              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none ${
                                isSelected
                                  ? 'bg-violet-50 border-violet-200'
                                  : 'bg-slate-50 border-transparent hover:border-slate-200 hover:bg-white'
                              }`}>
                              <span className={`mt-0.5 shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected ? 'bg-violet-600 border-violet-600' : 'border-slate-300 bg-white'
                              }`}>
                                {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                              </span>
                              <div className="flex-1 min-w-0">
                                {item.title && <p className="text-xs font-semibold text-slate-700 mb-0.5">{item.title}</p>}
                                <p className="text-sm text-slate-600 leading-relaxed">{item.content}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* ── Bottom CTA ─────────────────────────────────────────────────────────── */}
      {hasEsv && hasInsights && !generating && (
        <div className="mt-2 mb-6 p-5 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-slate-800">Ready to build your outline?</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedCount > 0
                ? `${selectedCount} insight${selectedCount === 1 ? '' : 's'} selected · all verse notes included`
                : 'Select research insights above, or generate from your notes alone'}
            </p>
          </div>
          {hasValidAIKey ? (
            <button onClick={handleGenerateOutline} disabled={genOutline}
              className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-40 transition-colors">
              {genOutline ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {genOutline ? 'Generating…' : 'Generate Outline'}
            </button>
          ) : (
            <p className="text-xs text-slate-400">Add an AI key in Settings to generate</p>
          )}
        </div>
      )}
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