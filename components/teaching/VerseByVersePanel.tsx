'use client'

import { useState, useRef, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'
import {
  Sparkles, BookOpen, AlertCircle, Loader2, Plus, Trash2, ArrowUp, ArrowDown, X, Settings2,
} from 'lucide-react'
import { PericopePanel } from './PericopePanel'
import { StudyPaneLayout } from './StudyPaneLayout'
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
  getVerseInsightsPromptAction,
  clearVerseInsightsAction,
} from '@/app/actions/verse-study'
import type { VerseData } from '@/lib/esv'
import type { StepState, PendingItem } from './TeachingWorkspace'
import type { OutlineBlock, VerseNote } from '@/types/database'
import { parseWordStudyTitle } from '@/lib/word-study'
import type { VerseInsightCustomSettings, VerseInsightDepth, VerseInsightScope } from '@/lib/ai/types'

type InsightItem = { title: string; content: string; source_label?: string; source_url?: string; is_flagged?: boolean; used_count?: number }
type Insights = Record<string, Record<string, InsightItem[]>>
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type CategoryKey = typeof CATEGORIES[number]['key']

type Props = {
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
  onInsightsChange: Dispatch<SetStateAction<Insights>>
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

const CATEGORIES = [
  { key: 'word_study', label: 'Word Study' },
  { key: 'cross_refs', label: 'Xref' },
  { key: 'practical', label: 'Analogy' },
  { key: 'theology_by_tradition', label: 'Theology' },
  { key: 'context', label: 'Context' },
  { key: 'application', label: 'Application' },
  { key: 'quotes', label: 'Quotes' },
] as const

const QUICK_SCAN_SETTINGS: VerseInsightCustomSettings = { itemsPerCategory: 2, sentencesPerItemMin: 1, sentencesPerItemMax: 2, crossRefsPerItemMin: 1, crossRefsPerItemMax: 1, maxWordsPerCategory: 120 }
const DEEP_DIVE_SETTINGS: VerseInsightCustomSettings = { itemsPerCategory: 4, sentencesPerItemMin: 3, sentencesPerItemMax: 5, crossRefsPerItemMin: 2, crossRefsPerItemMax: 4, maxWordsPerCategory: 300 }
const CUSTOM_RESEARCH_SETTINGS_KEY = 'vbv-research-custom-settings'
const SCRIPTURE_FONT_SIZES = [14, 15, 16, 18, 20, 22] as const
const SHARED_INSIGHTS_KEY = 'session:shared'

function sanitizeCustomSettings(value?: Partial<VerseInsightCustomSettings> | null): VerseInsightCustomSettings {
  return {
    itemsPerCategory: Math.max(1, Math.min(8, Number(value?.itemsPerCategory ?? 2))),
    sentencesPerItemMin: Math.max(1, Math.min(6, Number(value?.sentencesPerItemMin ?? 1))),
    sentencesPerItemMax: Math.max(1, Math.min(8, Number(value?.sentencesPerItemMax ?? 2))),
    crossRefsPerItemMin: Math.max(1, Math.min(6, Number(value?.crossRefsPerItemMin ?? 1))),
    crossRefsPerItemMax: Math.max(1, Math.min(8, Number(value?.crossRefsPerItemMax ?? 1))),
    maxWordsPerCategory: Math.max(40, Math.min(600, Number(value?.maxWordsPerCategory ?? 120))),
  }
}

function cleanWord(raw: string): string {
  return raw.replace(/[^a-zA-Z'-]/g, '').toLowerCase()
}

function getDisplayInsightItems(insights: Insights, scopeRef: string, category: CategoryKey) {
  const specific = (insights[scopeRef]?.[category] ?? []).map((item, index) => ({ ...item, __sourceRef: scopeRef, __sourceIndex: index }))
  const shared = (insights[SHARED_INSIGHTS_KEY]?.[category] ?? []).map((item, index) => ({ ...item, __sourceRef: SHARED_INSIGHTS_KEY, __sourceIndex: index, __shared: true }))
  return [...specific, ...shared]
}

export function VerseByVersePanel({
  sessionId, churchId, scriptureRef, hasValidAIKey, verses, insights, verseNotes,
  onVersesChange, onInsightsChange, onVerseNotesChange, onPendingItem, pendingItemId,
  pericopeMode, onPericopeModeChange, pericopeSections, onPericopeSectionsChange,
  hasSectionHeaders, onHasSectionHeadersChange, pericopeSetupComplete, onPericopeSetupCompleteChange,
  onScriptureRefSet, focusMode, activeSectionIdx, onActiveSectionChange, paneVisibility,
}: Props) {
  const [localRef, setLocalRef] = useState('')
  const [savingRef, setSavingRef] = useState(false)
  const [refError, setRefError] = useState<string | null>(null)
  const [loadingEsv, setLoadingEsv] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [showResearchConfig, setShowResearchConfig] = useState(false)
  const [showPromptPreview, setShowPromptPreview] = useState(false)
  const [researchPromptPreview, setResearchPromptPreview] = useState('')
  const [showOverwriteModal, setShowOverwriteModal] = useState(false)
  const [pendingGenerateConfig, setPendingGenerateConfig] = useState<{ scope: VerseInsightScope; depth: VerseInsightDepth; verseRefs?: string[]; customSettings?: VerseInsightCustomSettings } | null>(null)
  const [activeVerseRef, setActiveVerseRef] = useState<string | null>(null)
  const [hiddenVerseRefs, setHiddenVerseRefs] = useState<Set<string>>(new Set())
  const [activeCategoryByVerse, setActiveCategoryByVerse] = useState<Record<string, CategoryKey>>({})
  const [selectedWords, setSelectedWords] = useState<Record<string, string[]>>({})
  const [wordLimitNotice, setWordLimitNotice] = useState<Record<string, boolean>>({})
  const [researchScope, setResearchScope] = useState<VerseInsightScope>('whole_passage')
  const [researchDepth, setResearchDepth] = useState<VerseInsightDepth>('quick')
  const [selectedVerseRefs, setSelectedVerseRefs] = useState<string[]>([])
  const [customResearchSettings, setCustomResearchSettings] = useState<VerseInsightCustomSettings>(() => {
    if (typeof window === 'undefined') return QUICK_SCAN_SETTINGS
    try { return sanitizeCustomSettings(JSON.parse(window.localStorage.getItem(CUSTOM_RESEARCH_SETTINGS_KEY) ?? '{}')) } catch { return QUICK_SCAN_SETTINGS }
  })
  const [noteSaveStates, setNoteSaveStates] = useState<Record<string, SaveState>>({})
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [addingNote, setAddingNote] = useState<Record<string, boolean>>({})
  const [newNoteDraftByVerse, setNewNoteDraftByVerse] = useState<Record<string, string>>({})
  const [mobileTab, setMobileTab] = useState<'scripture' | 'notes' | 'research'>('scripture')
  const [scriptureFontIdx, setScriptureFontIdx] = useState(2)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const allVerseRefs = verses?.map(v => v.verse_ref) ?? []
  const visibleVerses = useMemo(() => (verses ?? []).filter(v => !hiddenVerseRefs.has(v.verse_ref)), [verses, hiddenVerseRefs])
  const activeVerse = useMemo(() => visibleVerses.find(v => v.verse_ref === activeVerseRef) ?? visibleVerses[0] ?? null, [visibleVerses, activeVerseRef])
  const activeVerseNotes = activeVerse ? (verseNotes[activeVerse.verse_ref] ?? []) : []
  const activeCategory = activeVerse ? (activeCategoryByVerse[activeVerse.verse_ref] ?? 'word_study') : 'word_study'
  const activeInsights = activeVerse ? getDisplayInsightItems(insights, activeVerse.verse_ref, activeCategory) : []
  const hasEsv = !!verses?.length
  const hasInsights = Object.keys(insights).length > 0

  useEffect(() => {
    if (researchScope === 'selected_verses' && selectedVerseRefs.length === 0 && allVerseRefs.length) setSelectedVerseRefs(allVerseRefs)
  }, [researchScope, selectedVerseRefs.length, allVerseRefs])

  useEffect(() => {
    try { window.localStorage.setItem(CUSTOM_RESEARCH_SETTINGS_KEY, JSON.stringify(customResearchSettings)) } catch {}
  }, [customResearchSettings])

  useEffect(() => {
    if (!activeVerseRef && visibleVerses[0]) setActiveVerseRef(visibleVerses[0].verse_ref)
    if (activeVerseRef && !visibleVerses.some(v => v.verse_ref === activeVerseRef)) setActiveVerseRef(visibleVerses[0]?.verse_ref ?? null)
  }, [visibleVerses, activeVerseRef])

  useEffect(() => () => { Object.values(saveTimers.current).forEach(clearTimeout) }, [])

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

  function toggleVerseVisibility(ref: string) {
    setHiddenVerseRefs(prev => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref)
      else if ((allVerseRefs.length - next.size) > 1) next.add(ref)
      return next
    })
  }

  async function refreshStudyData(ref: string) {
    const data = await fetchVerseDataAction(sessionId, ref)
    if (!data.error) {
      if (data.verses) onVersesChange(data.verses)
      onInsightsChange(data.insights)
      onVerseNotesChange(data.verseNotes)
    }
  }

  async function handleSetRef(mode: 'vbv' | 'pericope') {
    const trimmed = localRef.trim()
    if (!trimmed) { setRefError('Enter a scripture reference.'); return }
    setSavingRef(true)
    setRefError(null)
    const result = await setScriptureRefAction(sessionId, trimmed)
    if (result.error) { setRefError(result.error); setSavingRef(false); return }
    onScriptureRefSet(trimmed)
    await handleFetchEsv(mode, trimmed)
    setSavingRef(false)
  }

  async function handleFetchEsv(mode: 'vbv' | 'pericope' = 'vbv', refOverride?: string) {
    const ref = refOverride ?? scriptureRef
    if (!ref) return
    if (mode !== pericopeMode) {
      onPericopeModeChange(mode)
      await updateStudyModeAction(sessionId, mode)
    }
    setLoadingEsv(true)
    setFetchError(null)
    const data = await fetchVerseDataAction(sessionId, ref)
    setLoadingEsv(false)
    if (data.error) { setFetchError(data.error); return }
    if (data.verses) {
      onVersesChange(data.verses)
      setHiddenVerseRefs(new Set())
      setActiveVerseRef(data.verses[0]?.verse_ref ?? null)
      setSelectedVerseRefs(data.verses.map(v => v.verse_ref))
    }
    onInsightsChange(data.insights)
    onVerseNotesChange(data.verseNotes)

    if (mode === 'pericope') {
      const headers = await fetchPassageHeadersAction(ref)
      if (!headers.error) {
        onPericopeSectionsChange(headers.sections)
        onHasSectionHeadersChange(headers.hasHeaders)
        onPericopeSetupCompleteChange(headers.sections.length > 0)
      }
    }
  }

  async function handleAddNote(verseRef: string) {
    const content = (newNoteDraftByVerse[verseRef] ?? '').trim()
    if (!content) return
    setAddingNote(prev => ({ ...prev, [verseRef]: true }))
    const result = await createVerseNoteAction(sessionId, churchId, verseRef, content)
    setAddingNote(prev => ({ ...prev, [verseRef]: false }))
    if (result.error || !result.note) return
    onVerseNotesChange({ ...verseNotes, [verseRef]: [...(verseNotes[verseRef] ?? []), result.note] })
    setNewNoteDraftByVerse(prev => ({ ...prev, [verseRef]: '' }))
  }

  function handleNoteChange(noteId: string, value: string) {
    setNoteDrafts(prev => ({ ...prev, [noteId]: value }))
    setNoteSaveStates(prev => ({ ...prev, [noteId]: 'saving' }))
    if (saveTimers.current[noteId]) clearTimeout(saveTimers.current[noteId])
    saveTimers.current[noteId] = setTimeout(async () => {
      const result = await updateVerseNoteAction(noteId, value)
      setNoteSaveStates(prev => ({ ...prev, [noteId]: result.error ? 'error' : 'saved' }))
      onVerseNotesChange(Object.fromEntries(Object.entries(verseNotes).map(([key, notes]) => [key, notes.map(n => n.id === noteId ? { ...n, content: value } : n)])))
      if (!result.error) setTimeout(() => setNoteSaveStates(prev => ({ ...prev, [noteId]: 'idle' })), 1800)
    }, 700)
  }

  async function handleDeleteNote(verseRef: string, noteId: string) {
    const result = await deleteVerseNoteAction(noteId)
    if (result.error) return
    onVerseNotesChange({ ...verseNotes, [verseRef]: (verseNotes[verseRef] ?? []).filter(n => n.id !== noteId) })
  }

  async function handleMoveNote(verseRef: string, noteId: string, direction: 'up' | 'down') {
    const notes = [...(verseNotes[verseRef] ?? [])]
    const idx = notes.findIndex(n => n.id === noteId)
    if (idx === -1) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === notes.length - 1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    ;[notes[idx], notes[swapIdx]] = [notes[swapIdx], notes[idx]]
    onVerseNotesChange({ ...verseNotes, [verseRef]: notes })
    await reorderVerseNotesAction(notes.map(n => n.id))
  }

  function buildGenerateConfig(config?: { scope: VerseInsightScope; depth: VerseInsightDepth; verseRefs?: string[]; customSettings?: VerseInsightCustomSettings }) {
    const scope = config?.scope ?? researchScope
    const depth = config?.depth ?? researchDepth
    const verseRefs = scope === 'selected_verses' ? (config?.verseRefs?.length ? config.verseRefs : selectedVerseRefs) : undefined
    const customSettings = sanitizeCustomSettings(config?.customSettings ?? customResearchSettings)
    return { scope, depth, verseRefs, customSettings }
  }

  function scopeHasExistingInsights(config: { scope: VerseInsightScope; verseRefs?: string[] }) {
    const refs = config.scope === 'selected_verses' ? (config.verseRefs ?? []) : allVerseRefs
    return refs.some(ref => Object.values(insights[ref] ?? {}).some(items => items.length > 0))
  }

  async function executeGenerate(config?: { scope: VerseInsightScope; depth: VerseInsightDepth; verseRefs?: string[]; customSettings?: VerseInsightCustomSettings }, overwrite = false) {
    const resolved = buildGenerateConfig(config)
    setGenerating(true)
    setGenError(null)
    if (overwrite) {
      const refsToClear = resolved.scope === 'selected_verses' ? (resolved.verseRefs ?? []) : allVerseRefs
      const cleared = await clearVerseInsightsAction(sessionId, refsToClear)
      if (cleared.error) { setGenError(cleared.error); setGenerating(false); return }
    }
    const result = await generateVerseInsightsAction(sessionId, churchId, selectedWords, {
      scope: resolved.scope,
      depth: resolved.depth,
      verseRefs: resolved.verseRefs,
      customSettings: resolved.depth === 'custom' ? resolved.customSettings : null,
    })
    if (result.error) { setGenError(result.error); setGenerating(false); return }
    if (scriptureRef) await refreshStudyData(scriptureRef)
    setGenerating(false)
    setShowResearchConfig(false)
    setShowOverwriteModal(false)
    setPendingGenerateConfig(null)
  }

  async function handleGenerate(config?: { scope: VerseInsightScope; depth: VerseInsightDepth; verseRefs?: string[]; customSettings?: VerseInsightCustomSettings }) {
    const resolved = buildGenerateConfig(config)
    if (scopeHasExistingInsights(resolved)) {
      setPendingGenerateConfig(resolved)
      setShowOverwriteModal(true)
      return
    }
    await executeGenerate(resolved, false)
  }

  async function handleViewPrompt(config?: { scope: VerseInsightScope; depth: VerseInsightDepth; verseRefs?: string[]; customSettings?: VerseInsightCustomSettings }) {
    const resolved = buildGenerateConfig(config)
    setLoadingPrompt(true)
    setGenError(null)
    const result = await getVerseInsightsPromptAction(sessionId, selectedWords, {
      scope: resolved.scope,
      depth: resolved.depth,
      verseRefs: resolved.verseRefs,
      customSettings: resolved.depth === 'custom' ? resolved.customSettings : null,
    })
    setLoadingPrompt(false)
    if (result.error || !result.prompt) { setGenError(result.error ?? 'Could not build prompt.'); return }
    setResearchPromptPreview(result.prompt)
    setShowPromptPreview(true)
  }

  function renderScripturePane() {
    if (!activeVerse) return <p className="text-sm text-slate-400">No visible verse selected.</p>
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{activeVerse.verse_ref}</p>
          <p className="text-[11px] font-medium text-slate-400">
            {selectedWords[activeVerse.verse_ref]?.length
              ? <span className="text-violet-600">{selectedWords[activeVerse.verse_ref].length} word{selectedWords[activeVerse.verse_ref].length !== 1 ? 's' : ''} selected for study</span>
              : <>Tap words to request word study <span className="text-slate-300">(up to 5)</span></>}
          </p>
          {wordLimitNotice[activeVerse.verse_ref] && <p className="text-[11px] text-amber-600">Word limit reached. Remove one to select another.</p>}
        </div>
        <p className="font-serif leading-relaxed text-slate-800" style={{ fontSize: SCRIPTURE_FONT_SIZES[scriptureFontIdx] }}>
          {activeVerse.text.split(/\b/).map((token, i) => {
            const cleaned = cleanWord(token)
            if (!cleaned || cleaned.length < 3) return <span key={i}>{token}</span>
            const isSelected = (selectedWords[activeVerse.verse_ref] ?? []).includes(cleaned)
            const maxed = (selectedWords[activeVerse.verse_ref]?.length ?? 0) >= 5
            return (
              <span
                key={i}
                onClick={() => (!maxed || isSelected) && toggleWord(activeVerse.verse_ref, cleaned)}
                className={isSelected ? 'cursor-pointer rounded bg-violet-200 text-violet-900 font-semibold px-0.5' : maxed ? 'opacity-50' : 'cursor-pointer rounded hover:bg-violet-50 hover:text-violet-700'}
              >
                {token}
              </span>
            )
          })}
        </p>
      </div>
    )
  }

  function renderNotesPane() {
    if (!activeVerse) return <p className="text-sm text-slate-400">No visible verse selected.</p>
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <AutoResizeTextarea
            value={newNoteDraftByVerse[activeVerse.verse_ref] ?? ''}
            onChange={(value) => setNewNoteDraftByVerse(prev => ({ ...prev, [activeVerse.verse_ref]: value }))}
            placeholder="Add a pastor note…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <div className="flex justify-end">
            <button onClick={() => handleAddNote(activeVerse.verse_ref)} disabled={addingNote[activeVerse.verse_ref]} className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
              {addingNote[activeVerse.verse_ref] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Add note
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {activeVerseNotes.length === 0 ? <p className="text-sm text-slate-400">No notes yet for this verse.</p> : activeVerseNotes.map((note, idx) => {
            const draft = noteDrafts[note.id] ?? note.content
            const saveState = noteSaveStates[note.id] ?? 'idle'
            return (
              <div key={note.id} className={`rounded-xl border p-3 space-y-2 ${saveState === 'error' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleMoveNote(activeVerse.verse_ref, note.id, 'up')} disabled={idx === 0} className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleMoveNote(activeVerse.verse_ref, note.id, 'down')} disabled={idx === activeVerseNotes.length - 1} className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                    <button onClick={() => onPendingItem({ sourceId: note.id, content: note.content, type: 'sub_point', sourceKind: 'note' })} className={`p-1 rounded ${pendingItemId === note.id ? 'bg-violet-100 text-violet-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`} title="Place in outline"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <button onClick={() => handleDeleteNote(activeVerse.verse_ref, note.id)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <AutoResizeTextarea value={draft} onChange={(value) => handleNoteChange(note.id, value)} placeholder="Type your thoughts…" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300" />
                {saveState !== 'idle' && <p className={`text-[11px] ${saveState === 'error' ? 'text-red-600' : 'text-slate-400'}`}>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Could not save.'}</p>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderResearchPane() {
    if (!activeVerse) return <p className="text-sm text-slate-400">No visible verse selected.</p>
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(cat => {
            const items = getDisplayInsightItems(insights, activeVerse.verse_ref, cat.key)
            const active = activeCategory === cat.key
            return (
              <button key={cat.key} type="button" onClick={() => setActiveCategoryByVerse(prev => ({ ...prev, [activeVerse.verse_ref]: cat.key }))} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium ${active ? 'bg-slate-900 text-white' : items.length ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-50 text-slate-300'}`}>
                {cat.label}
              </button>
            )
          })}
        </div>
        {activeInsights.length === 0 ? (
          <p className="text-sm text-slate-400">No AI research yet for this category.</p>
        ) : (
          <div className="space-y-2">
            {activeInsights.map((item, index) => (
              <ResearchItemCard
                key={`${item.__sourceRef}-${activeCategory}-${index}`}
                item={item}
                pendingItemId={pendingItemId}
                onPlace={() => onPendingItem({
                  sourceId: `${item.__sourceRef}-${activeCategory}-${item.__sourceIndex}`,
                  content: item.title ? `${item.title} — ${item.content}` : item.content,
                  type: activeCategory === 'application' ? 'application' : activeCategory === 'practical' ? 'illustration' : 'sub_point',
                  sourceKind: 'research',
                })}
                onToggleFlag={(flagged) => {
                  onInsightsChange(prev => ({
                    ...prev,
                    [item.__sourceRef]: {
                      ...(prev[item.__sourceRef] ?? {}),
                      [activeCategory]: (prev[item.__sourceRef]?.[activeCategory] ?? []).map((entry, entryIdx) => entryIdx === item.__sourceIndex ? { ...entry, is_flagged: flagged } : entry),
                    },
                  }))
                  toggleInsightFlagAction(sessionId, item.__sourceRef, activeCategory, item.__sourceIndex, flagged).catch(() => null)
                }}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!scriptureRef) {
    return <div className="flex flex-col items-center justify-center py-20 text-center gap-4"><BookOpen className="w-10 h-10 text-slate-200" /><div className="w-full max-w-sm text-left"><p className="text-sm font-semibold text-slate-700 mb-3 text-center">Add Scripture</p><input autoFocus value={localRef} onChange={e => setLocalRef(e.target.value)} onKeyDown={e => e.key === 'Enter' && !savingRef && handleSetRef('vbv')} placeholder="e.g. Mark 11:1-10" className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-300 placeholder:text-slate-300 mb-3" />{refError && <p className="text-xs text-red-500 mb-2">{refError}</p>}<p className="text-xs text-slate-400 mb-2 text-center">How do you want to study this passage?</p><div className="flex gap-2"><button onClick={() => handleSetRef('vbv')} disabled={savingRef || !localRef.trim()} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 disabled:opacity-40 transition-colors">{savingRef ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}Verse by Verse</button><button onClick={() => handleSetRef('pericope')} disabled={savingRef || !localRef.trim()} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 disabled:opacity-40 transition-colors">{savingRef ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}By Section</button></div></div></div>
  }

  if (pericopeMode === 'pericope' && verses) {
    return <PericopePanel sessionId={sessionId} churchId={churchId} verses={verses} sections={pericopeSections} hasHeaders={hasSectionHeaders || pericopeSections.length > 0} setupComplete={pericopeSetupComplete} onSetupCompleteChange={onPericopeSetupCompleteChange} insights={insights} onInsightsChange={onInsightsChange} onSectionsChange={onPericopeSectionsChange} verseNotes={verseNotes} onVerseNotesChange={onVerseNotesChange} pending={null} focusMode={focusMode} activeSectionIdx={activeSectionIdx} onActiveSectionChange={onActiveSectionChange} paneVisibility={{ scripture: true, notes: true, research: true }} onItemPlaced={(item) => onPendingItem({ sourceId: item.id, content: item.content, type: item.type as any, sourceKind: item.source === 'note' ? 'note' : 'research' })} />
  }

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      {(fetchError || genError) && <ErrorBanner message={fetchError ?? genError ?? ''} />}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="shrink-0 flex items-center gap-1">
            <button type="button" onClick={() => setScriptureFontIdx(idx => Math.max(0, idx - 1))} disabled={scriptureFontIdx === 0} className={`h-7 w-7 rounded-lg border text-slate-500 ${scriptureFontIdx === 0 ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-200 hover:bg-slate-50 hover:text-slate-700'}`}><span className="text-[11px] font-semibold leading-none">A</span></button>
            <button type="button" onClick={() => setScriptureFontIdx(idx => Math.min(SCRIPTURE_FONT_SIZES.length - 1, idx + 1))} disabled={scriptureFontIdx === SCRIPTURE_FONT_SIZES.length - 1} className={`h-7 w-7 rounded-lg border text-slate-500 ${scriptureFontIdx === SCRIPTURE_FONT_SIZES.length - 1 ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-200 hover:bg-slate-50 hover:text-slate-700'}`}><span className="text-[15px] font-semibold leading-none">A</span></button>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => handleFetchEsv('vbv')} className={`px-3 py-1.5 text-xs font-medium rounded-lg ${pericopeMode === 'vbv' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>Verse by Verse</button>
            <button onClick={() => handleFetchEsv('pericope')} className={`px-3 py-1.5 text-xs font-medium rounded-lg ${pericopeMode === 'pericope' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>By Section</button>
            {hasValidAIKey && hasEsv && <button onClick={() => setShowResearchConfig(true)} disabled={generating} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50">{generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Settings2 className="w-3.5 h-3.5" />}{generating ? 'Generating…' : hasInsights ? 'Regenerate AI' : 'Generate AI'}</button>}
          </div>
        </div>

        {loadingEsv ? <div className="px-4 py-10 flex items-center justify-center text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading passage…</div> : !hasEsv ? <div className="px-4 py-10 text-sm text-slate-400">No passage loaded.</div> : (
          <>
            <div className="px-4 py-3 border-b border-slate-100 space-y-3">
              <div className="flex flex-wrap gap-2">
                {visibleVerses.map((verse, idx) => (
                  <button key={verse.verse_ref} type="button" onClick={() => setActiveVerseRef(verse.verse_ref)} className={`px-3 py-1.5 rounded-full text-[11px] border ${activeVerse?.verse_ref === verse.verse_ref ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>{verse.verse_ref}</button>
                ))}
              </div>
              {allVerseRefs.length > 1 && <div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-medium text-slate-400">Show / hide verses</span>{allVerseRefs.map(ref => { const visible = !hiddenVerseRefs.has(ref); return <button key={ref} type="button" onClick={() => toggleVerseVisibility(ref)} className={`px-2.5 py-1 rounded-lg text-[11px] border ${visible ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-slate-200 bg-white text-slate-300'}`}>{ref}</button> })}{hiddenVerseRefs.size > 0 && <button type="button" onClick={() => setHiddenVerseRefs(new Set())} className="text-[11px] text-violet-600 hover:text-violet-800">Show all</button>}</div>}
            </div>

            <div className={`flex flex-col min-h-0 ${focusMode ? 'h-[calc(100vh-10rem)]' : 'h-[calc(100vh-16rem)]'}`}>
              <StudyPaneLayout paneVisibility={{ scripture: true, notes: true, research: true }} mobileTab={mobileTab} onMobileTabChange={setMobileTab} renderPane={(pane) => pane === 'scripture' ? renderScripturePane() : pane === 'notes' ? renderNotesPane() : renderResearchPane()} desktopClassName="hidden md:grid flex-1 min-h-0 relative" desktopPanePaddingClassName="h-full min-h-0 p-4 overflow-y-auto border-r border-slate-100 last:border-r-0" />
            </div>
          </>
        )}
      </div>

      {showResearchConfig && <ResearchConfigModal scope={researchScope} depth={researchDepth} selectedVerseRefs={selectedVerseRefs} allVerseRefs={allVerseRefs} customSettings={customResearchSettings} loading={generating || loadingPrompt} onScopeChange={setResearchScope} onDepthChange={setResearchDepth} onSelectedVerseRefsChange={setSelectedVerseRefs} onCustomSettingsChange={setCustomResearchSettings} onGenerate={handleGenerate} onViewPrompt={handleViewPrompt} onClose={() => setShowResearchConfig(false)} />}
      {showPromptPreview && <PromptPreviewModal prompt={researchPromptPreview} onClose={() => setShowPromptPreview(false)} />}
      {showOverwriteModal && <OverwriteResearchModal onClose={() => { setShowOverwriteModal(false); setPendingGenerateConfig(null) }} onConfirm={() => pendingGenerateConfig && executeGenerate(pendingGenerateConfig, true)} generating={generating} />}
    </div>
  )
}

function ResearchItemCard({ item, pendingItemId, onPlace, onToggleFlag }: { item: InsightItem & { __sourceRef: string; __sourceIndex: number; __shared?: boolean }; pendingItemId: string | null; onPlace: () => void; onToggleFlag: (flagged: boolean) => void }) {
  const pendingKey = `${item.__sourceRef}-${item.__sourceIndex}-${item.title}`
  return <div className={`rounded-xl border p-3 ${item.is_flagged ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'}`}><div className="flex items-start gap-3"><div className="flex flex-col items-center gap-1 shrink-0"><button onClick={onPlace} className={`p-1 rounded ${pendingItemId === pendingKey ? 'bg-violet-100 text-violet-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`} title="Place in outline"><Plus className="w-3.5 h-3.5" /></button><button onClick={() => onToggleFlag(!item.is_flagged)} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${item.is_flagged ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{item.is_flagged ? '✓' : 'Flag'}</button></div><div className="min-w-0 flex-1">{item.title && <WordStudyTitle title={item.title} />}<p className="text-sm text-slate-600 leading-relaxed">{item.content}</p></div></div></div>
}

function AutoResizeTextarea({ value, onChange, placeholder, className }: { value: string; onChange: (value: string) => void; placeholder: string; className: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => { if (!ref.current) return; ref.current.style.height = '0px'; ref.current.style.height = `${ref.current.scrollHeight}px` }, [value])
  return <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={1} className={className} />
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{message}</div>
}

function WordStudyTitle({ title }: { title: string }) {
  const parsed = parseWordStudyTitle(title)
  if (!parsed) return <span className="text-xs font-semibold text-slate-700 block mb-0.5">{title}</span>
  return <div className="mb-1"><span className="text-xs font-semibold text-slate-700">{parsed.english}</span>{parsed.original ? <span className="text-xs text-slate-500"> {' '}| {parsed.original}</span> : null}{parsed.transliteration ? <span className="text-xs text-slate-400"> ({parsed.transliteration})</span> : null}</div>
}

function ResearchConfigModal({ scope, depth, selectedVerseRefs, allVerseRefs, customSettings, loading, onScopeChange, onDepthChange, onSelectedVerseRefsChange, onCustomSettingsChange, onGenerate, onViewPrompt, onClose }: { scope: VerseInsightScope; depth: VerseInsightDepth; selectedVerseRefs: string[]; allVerseRefs: string[]; customSettings: VerseInsightCustomSettings; loading: boolean; onScopeChange: (scope: VerseInsightScope) => void; onDepthChange: (depth: VerseInsightDepth) => void; onSelectedVerseRefsChange: (refs: string[]) => void; onCustomSettingsChange: (settings: VerseInsightCustomSettings) => void; onGenerate: (config: { scope: VerseInsightScope; depth: VerseInsightDepth; verseRefs?: string[]; customSettings?: VerseInsightCustomSettings }) => void; onViewPrompt: (config: { scope: VerseInsightScope; depth: VerseInsightDepth; verseRefs?: string[]; customSettings?: VerseInsightCustomSettings }) => void; onClose: () => void }) {
  const effective = depth === 'custom' ? sanitizeCustomSettings(customSettings) : depth === 'deep' ? DEEP_DIVE_SETTINGS : QUICK_SCAN_SETTINGS
  function field(key: keyof VerseInsightCustomSettings, value: number) { onCustomSettingsChange(sanitizeCustomSettings({ ...customSettings, [key]: value })) }
  const config = { scope, depth, verseRefs: scope === 'selected_verses' ? selectedVerseRefs : undefined, customSettings: depth === 'custom' ? customSettings : undefined }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"><div className="flex items-center justify-between px-6 py-4 border-b border-slate-100"><div><h2 className="text-sm font-semibold text-slate-900">Generate AI Research</h2><p className="text-xs text-slate-400 mt-0.5">Choose scope, depth, and numeric limits.</p></div><button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button></div><div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto"><div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Scope</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><button type="button" onClick={() => onScopeChange('whole_passage')} className={`text-left rounded-xl border px-3 py-2 ${scope === 'whole_passage' ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}><div className="text-sm font-medium">Whole passage</div><div className="text-xs text-slate-400">Generate research for all visible verses in the passage.</div></button><button type="button" onClick={() => onScopeChange('selected_verses')} className={`text-left rounded-xl border px-3 py-2 ${scope === 'selected_verses' ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}><div className="text-sm font-medium">Selected verses</div><div className="text-xs text-slate-400">Limit research to the verses you choose below.</div></button></div>{scope === 'selected_verses' && <div className="mt-3 rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between mb-2"><p className="text-xs font-medium text-slate-600">Choose verses</p><div className="flex items-center gap-2 text-xs"><button type="button" onClick={() => onSelectedVerseRefsChange(allVerseRefs)} className="text-violet-600 hover:text-violet-800">All</button><span className="text-slate-300">·</span><button type="button" onClick={() => onSelectedVerseRefsChange([])} className="text-slate-500 hover:text-slate-700">None</button></div></div><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{allVerseRefs.map(ref => { const checked = selectedVerseRefs.includes(ref); return <button key={ref} type="button" onClick={() => onSelectedVerseRefsChange(checked ? selectedVerseRefs.filter(v => v !== ref) : [...selectedVerseRefs, ref])} className={`rounded-lg border px-2.5 py-2 text-xs text-left ${checked ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>{ref}</button> })}</div></div>}</div><div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Depth</p><div className="grid grid-cols-1 sm:grid-cols-3 gap-2"><button type="button" onClick={() => onDepthChange('quick')} className={`text-left rounded-xl border px-3 py-2 ${depth === 'quick' ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}><div className="text-sm font-medium">Quick Scan</div><div className="text-xs text-slate-400">2 items per category · 1–2 sentences per item.</div></button><button type="button" onClick={() => onDepthChange('deep')} className={`text-left rounded-xl border px-3 py-2 ${depth === 'deep' ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}><div className="text-sm font-medium">Deep Dive</div><div className="text-xs text-slate-400">4 items per category · 3–5 sentences per item.</div></button><button type="button" onClick={() => onDepthChange('custom')} className={`text-left rounded-xl border px-3 py-2 ${depth === 'custom' ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}><div className="text-sm font-medium">Custom</div><div className="text-xs text-slate-400">Edit the numbers and keep them for next time.</div></button></div></div>{depth === 'custom' && <div className="rounded-xl border border-slate-200 p-4 space-y-3"><p className="text-xs font-semibold text-slate-700">Custom settings</p><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"><NumberField label="Items per category" value={customSettings.itemsPerCategory} onChange={(value) => field('itemsPerCategory', value)} min={1} max={8} /><NumberField label="Min sentences per item" value={customSettings.sentencesPerItemMin} onChange={(value) => field('sentencesPerItemMin', value)} min={1} max={6} /><NumberField label="Max sentences per item" value={customSettings.sentencesPerItemMax} onChange={(value) => field('sentencesPerItemMax', value)} min={1} max={8} /><NumberField label="Min supporting refs" value={customSettings.crossRefsPerItemMin} onChange={(value) => field('crossRefsPerItemMin', value)} min={1} max={6} /><NumberField label="Max supporting refs" value={customSettings.crossRefsPerItemMax} onChange={(value) => field('crossRefsPerItemMax', value)} min={1} max={8} /><NumberField label="Max words per category" value={customSettings.maxWordsPerCategory} onChange={(value) => field('maxWordsPerCategory', value)} min={40} max={600} step={10} /></div></div>}<div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500">Current output target: {effective.itemsPerCategory} items per category, {effective.sentencesPerItemMin}–{effective.sentencesPerItemMax} sentences per item, {effective.crossRefsPerItemMin}–{effective.crossRefsPerItemMax} supporting references, about {effective.maxWordsPerCategory} words max per category.</div></div><div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3"><button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button><div className="flex items-center gap-2"><button onClick={() => onViewPrompt(config)} disabled={loading || (scope === 'selected_verses' && selectedVerseRefs.length === 0)} className="px-4 py-2 text-xs font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50">View Prompt</button><button onClick={() => onGenerate(config)} disabled={loading || (scope === 'selected_verses' && selectedVerseRefs.length === 0)} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{loading ? 'Working…' : 'Send to AI'}</button></div></div></div></div>
}

function NumberField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number }) { return <label className="flex flex-col gap-1 text-[11px] text-slate-500"><span className="font-medium text-slate-600">{label}</span><input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300" /></label> }

function PromptPreviewModal({ prompt, onClose }: { prompt: string; onClose: () => void }) { const [copied, setCopied] = useState(false); async function handleCopy() { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 2000) } return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-3xl max-h-[85vh] rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col"><div className="flex items-center justify-between px-6 py-4 border-b border-slate-100"><div><h2 className="text-sm font-semibold text-slate-900">Research Prompt</h2><p className="text-xs text-slate-400 mt-0.5">Review or copy the exact prompt before sending it to AI.</p></div><button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button></div><div className="flex-1 overflow-auto px-6 py-4"><pre className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap break-words bg-slate-50 border border-slate-200 rounded-xl p-4">{prompt}</pre></div><div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3"><button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Close</button><button onClick={handleCopy} className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors">{copied ? 'Copied' : 'Copy to Clipboard'}</button></div></div></div> }

function OverwriteResearchModal({ onClose, onConfirm, generating }: { onClose: () => void; onConfirm: () => void; generating: boolean }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"><div className="px-6 py-4 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-900">Overwrite existing research?</h2><p className="text-xs text-slate-400 mt-0.5">This will delete the stored AI research in the selected scope before generating again.</p></div><div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3"><button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">No, go back</button><button onClick={onConfirm} disabled={generating} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">{generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{generating ? 'Working…' : 'Yes, overwrite'}</button></div></div></div> }
