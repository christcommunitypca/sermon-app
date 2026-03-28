'use client'
import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { BookOpen, Save, Sparkles, Share2, NotebookPen, Loader2, X, AlertCircle } from 'lucide-react'
import { VerseByVersePanel } from './VerseByVersePanel'
import { ExportModal } from './ExportModal'
import { updateStudyModeAction } from '@/app/actions/verse-study'
import type { OutlineBlock, VerseNote } from '@/types/database'
import type { VerseData } from '@/lib/esv'
import { TeachingNavToggleButton } from './TeachingNavToggleButton'

import {
  buildOutlinePromptParts,
  renderOutlinePromptForHuman,
  renderOutlinePromptForLLM,
  type OutlineSelectedFlow
} from '@/lib/outlinePrompt'
import { OutlinePanel, DraftOutlineModal, PromptPreviewModal } from './OutlinePanel'
export interface PendingItem {
  content:    string
  type:       OutlineBlock['type']
  sourceKind: 'note' | 'research'
  sourceId:   string
}

export type TeachingMode = 'verse_by_verse' | 'outline' | 'pericope'
export type StepKey = 'load_text' | 'notes' | 'research' | 'outline' | 'ai_review' | 'publish'

export interface StepState {
  key:        StepKey
  label:      string
  done:       boolean
  inProgress: boolean
  active:     boolean
  future:     boolean
}

export function buildSteps(
  hasVerses:   boolean,
  hasNotes:    boolean,
  hasResearch: boolean,
  hasBlocks:   boolean,
  isPublished: boolean,
): StepState[] {
  const steps: { key: StepKey; label: string; done: boolean }[] = [
    { key: 'load_text', label: 'Load Text',     done: hasVerses },
    { key: 'notes',     label: 'Notes',         done: hasNotes },
    { key: 'research',  label: 'Research',      done: hasResearch },
    { key: 'outline',   label: 'Build Outline', done: false },
    { key: 'ai_review', label: 'AI Review',     done: false },
    { key: 'publish',   label: 'Publish',       done: isPublished },
  ]
  const firstUndoneIdx = steps.findIndex(s => !s.done)
  return steps.map((s, i) => ({
    ...s,
    inProgress: s.key === 'outline' && hasBlocks && !s.done,
    active: i === firstUndoneIdx,
    future: i > firstUndoneIdx && !s.done,
  }))
}

type Insights = Record<string, Record<string, { title: string; content: string; is_flagged?: boolean; used_count?: number }[]>>

type SectionHeader = { label: string; startVerse: string; endVerse?: string }

type PaneKey = 'scripture' | 'notes' | 'research'

type PaneVisibility = Record<PaneKey, boolean>

interface Props {
  sessionId:         string
  churchId:          string
  churchSlug:        string
  outlineId:         string
  initialBlocks:     OutlineBlock[]
  selectedFlow?:    OutlineSelectedFlow | null
  hasValidAIKey:     boolean
  scriptureRef:      string | null
  initialStudyMode: 'vbv' | 'pericope'
  estimatedDuration: number | null
  initialVerses:     VerseData[] | null
  initialInsights:   Insights
  initialVerseNotes: Record<string, VerseNote[]>
  isPublished:        boolean
  sessionTitle:       string
  scheduledDate:      string | null
  initialPericSections?: Array<{label:string;startVerse:string}>
  initialHasSectionHeaders?: boolean
  initialPericopeSetupComplete?: boolean
}

function verseRangeForSection(verses: VerseData[] | null, sections: SectionHeader[], idx: number) {
  const section = sections[idx]
  if (!section) return ''
  const verseList = verses ?? []
  const startIdx = verseList.findIndex(v => v.verse_ref === section.startVerse)
  if (startIdx === -1) return section.startVerse
  let endIdx = verseList.length - 1
  if (section.endVerse) {
    const explicit = verseList.findIndex(v => v.verse_ref === section.endVerse)
    if (explicit >= startIdx) endIdx = explicit
  } else if (idx + 1 < sections.length) {
    const nextIdx = verseList.findIndex(v => v.verse_ref === sections[idx + 1].startVerse)
    if (nextIdx > startIdx) endIdx = nextIdx - 1
  }
  const first = verseList[startIdx]?.verse_ref ?? section.startVerse
  const last = verseList[endIdx]?.verse_ref ?? first
  const firstParts = first.match(/^(.+)\s(\d+):(\d+)$/)
  const lastParts = last.match(/^(.+)\s(\d+):(\d+)$/)
  if (firstParts && lastParts && firstParts[1] === lastParts[1] && firstParts[2] === lastParts[2]) {
    return `${firstParts[1]} ${firstParts[2]}:${firstParts[3]}–${lastParts[3]}`
  }
  return first === last ? first : `${first}–${last}`
}

function verseRefsForSection(verses: VerseData[] | null, sections: SectionHeader[], idx: number) {
  const section = sections[idx]
  if (!section || !verses?.length) return []
  const startIdx = verses.findIndex(v => v.verse_ref === section.startVerse)
  if (startIdx === -1) return [section.startVerse]
  let endIdx = verses.length - 1
  if (section.endVerse) {
    const explicit = verses.findIndex(v => v.verse_ref === section.endVerse)
    if (explicit >= startIdx) endIdx = explicit
  } else if (idx + 1 < sections.length) {
    const nextIdx = verses.findIndex(v => v.verse_ref === sections[idx + 1].startVerse)
    if (nextIdx > startIdx) endIdx = nextIdx - 1
  }
  return verses.slice(startIdx, endIdx + 1).map(v => v.verse_ref)
}

export function TeachingWorkspace({
  sessionId, churchId, churchSlug, outlineId,
  initialBlocks, selectedFlow, hasValidAIKey,
  scriptureRef, initialStudyMode, estimatedDuration,
  initialVerses, initialInsights, initialVerseNotes,
  isPublished, sessionTitle, scheduledDate,
  initialPericSections, initialHasSectionHeaders, initialPericopeSetupComplete = false,
}: Props) {
  const computedInitialMode: TeachingMode =
    initialStudyMode === 'pericope' ? 'pericope' : 'verse_by_verse'


  const [mode, setMode] = useState<TeachingMode>(computedInitialMode)
  const [verses, setVerses] = useState<VerseData[] | null>(initialVerses)
  const [insights, setInsights] = useState<Insights>(initialInsights)
  const [verseNotes, setVerseNotes] = useState<Record<string, VerseNote[]>>(initialVerseNotes)
  const [blocks, setBlocks] = useState<OutlineBlock[]>(initialBlocks)
  const [pending, setPending] = useState<PendingItem | null>(null)
  const outlineSaveFn = React.useRef<() => Promise<void> | void>(() => {})
  const outlineAIFn = React.useRef<() => void>(() => {})
  const [localScriptureRef, setLocalScriptureRef] = useState<string | null>(scriptureRef)
  const [showExport, setShowExport] = useState(false)
  const [focusMode, setFocusMode] = useState(initialStudyMode === 'pericope')
  const [pericopeMode, setPericopeMode] = useState<'vbv' | 'pericope'>(initialStudyMode)
  const [pericSections, setPericSections] = useState<Array<{label:string;startVerse:string}>>(initialPericSections ?? [])
  const [hasSectionHeaders, setHasSectionHeaders] = useState(initialHasSectionHeaders ?? false)
  const [pericopeSetupComplete, setPericopeSetupComplete] = useState((initialPericopeSetupComplete ?? false) || (initialPericSections?.length ?? 0) > 0)
  const [activeSectionIdx, setActiveSectionIdx] = useState(0)
  const [outlineSectionRefs, setOutlineSectionRefs] = useState<string[] | null>(null)
  const [outlineReferenceTab, setOutlineReferenceTab] = useState<'scripture' | 'notes' | 'ai'>('ai')
  const [showReplaceOutlineModal, setShowReplaceOutlineModal] = useState(false)
  const [deletingOutline, setDeletingOutline] = useState(false)
  const [outlineAiLoading, setOutlineAiLoading] = useState(false)
  const [showDraftOutlineModal, setShowDraftOutlineModal] = useState(false)
  const hasOutline = blocks.length > 0
  const showOutlinePane = hasOutline
  const [paneVisibility, setPaneVisibility] = useState<PaneVisibility>({
    scripture: true,
    notes: true,
    research: true,
  })
  const [showPromptPreviewModal, setShowPromptPreviewModal] = useState(false)
  const [humanPromptPreview, setHumanPromptPreview] = useState('')
  const [llmPromptPreview, setLlmPromptPreview] = useState('')
  const legacyFlowStructure = useMemo(
    () =>
      selectedFlow?.steps?.map(step => ({
        type: step.suggestedBlockType ?? 'point',
        label: step.title,
      })) ?? [],
    [selectedFlow]
  )
  
  
  useEffect(() => {
    if (pericSections.length > 0 && !pericopeSetupComplete) setPericopeSetupComplete(true)
  }, [pericSections, pericopeSetupComplete])

  useEffect(() => {
    updateStudyModeAction(sessionId, pericopeMode).catch(() => null)
  }, [sessionId, pericopeMode])

  useEffect(() => {
    const topbar = document.getElementById('session-page-topbar')
    const detailHeader = document.getElementById('session-page-detail-header')
    const shouldCollapse = focusMode
    if (topbar) topbar.style.display = shouldCollapse ? 'none' : ''
    if (detailHeader) detailHeader.style.display = shouldCollapse ? 'none' : ''
    return () => {
      if (topbar) topbar.style.display = ''
      if (detailHeader) detailHeader.style.display = ''
    }
  }, [focusMode])

 
  const sectionChips = useMemo(() => (
    pericSections.map((section, idx) => ({
      idx,
      label: verseRangeForSection(verses, pericSections as SectionHeader[], idx),
      refs: verseRefsForSection(verses, pericSections as SectionHeader[], idx),
    }))
  ), [pericSections, verses])

  const sectionVerseRefMap = useMemo(() => (
    Object.fromEntries(sectionChips.map(chip => [`pericope:${pericSections[chip.idx]?.startVerse ?? ''}`, chip.refs]))
  ), [sectionChips, pericSections])

  useEffect(() => {
    if (activeSectionIdx > Math.max(sectionChips.length - 1, 0)) setActiveSectionIdx(0)
  }, [activeSectionIdx, sectionChips.length])

  function persistMode(nextMode: TeachingMode) {
    setMode(nextMode)
  }

  function openOutline(openAssist = false) {
    if (sectionChips[activeSectionIdx]) {
      setOutlineSectionRefs(sectionChips[activeSectionIdx].refs)
    }
    //setMode('outline')
  //removed stale outline assist queue behavior
  }
  
  function handleSelectSection(idx: number) {
    setActiveSectionIdx(idx)
    if (showOutlinePane) setOutlineSectionRefs(sectionChips[idx]?.refs ?? null)
  }

  function handleTogglePane(pane: PaneKey) {
    setPaneVisibility(prev => {
      const currentlyVisible = (prev.scripture ? 1 : 0) + (prev.notes ? 1 : 0) + (prev.research ? 1 : 0)
      if (prev[pane] && currentlyVisible === 1) return prev
      return { ...prev, [pane]: !prev[pane] }
    })
  }

  const persistGeneratedOutline = useCallback(async (newBlocks: OutlineBlock[]) => {
    setBlocks(newBlocks)

    try {
      const { saveBlocksAction } = await import('@/app/(app)/[churchSlug]/teaching/[sessionId]/outline-actions')
      const result = await saveBlocksAction(outlineId, sessionId, churchId, newBlocks)
      if (result.error) {
        console.error('Failed to save generated outline:', result.error)
      }
    } catch (error) {
      console.error('Failed to persist generated outline:', error)
    }
  }, [outlineId, sessionId, churchId])

  const handleOutlineGenerated = useCallback((newBlocks: OutlineBlock[]) => {
    void persistGeneratedOutline(newBlocks)
    openOutline(false)
  }, [persistGeneratedOutline, openOutline])

  const handleItemPlaced = useCallback((item: PendingItem) => {
    if (item.sourceKind === 'note') {
      setVerseNotes(prev => {
        const next = { ...prev }
        for (const ref of Object.keys(next)) {
          next[ref] = next[ref].map(n => n.id === item.sourceId ? { ...n, used_count: n.used_count + 1 } : n)
        }
        return next
      })
    }
    setPending(null)
  }, [])

  const hasVerses = !!verses?.length
  const hasNotes = Object.values(verseNotes).some(arr => arr.some(n => n.content.trim()))
  const hasResearch = Object.keys(insights).length > 0
  const hasBlocks = blocks.length > 0
  const steps = buildSteps(hasVerses, hasNotes, hasResearch, hasBlocks, isPublished)
  const showSectionRail = sectionChips.length > 0 && pericopeMode === 'pericope' && !hasOutline
  const canTogglePanes = !hasOutline
  const lockedStudyMode = initialStudyMode

  function refMatchesSelectedVerses(ref: string, selectedVerseRefs: string[]) {
    if (!selectedVerseRefs.length) return false
    if (ref === 'session:shared') return true
    if (selectedVerseRefs.includes(ref)) return true
    const mappedRefs = sectionVerseRefMap[ref] ?? []
    return mappedRefs.some(verseRef => selectedVerseRefs.includes(verseRef))
  }

  function collectOutlineVerseNotes(scope: 'all_verses' | 'selected_verses', selectedVerseRefs: string[]) {
    const notesForAI: Record<string, string> = {}
    for (const [vRef, notes] of Object.entries(verseNotes)) {
      if (scope === 'selected_verses' && !refMatchesSelectedVerses(vRef, selectedVerseRefs)) continue
      const text = notes.filter(n => n.content.trim()).map(n => n.content).join('\n')
      if (text) notesForAI[vRef] = text
    }
    return notesForAI
  }

  function collectOutlineInsights(
    selectedInsights: Array<{ verseRef: string; category: string; title: string; content: string }>,
    scope: 'all_verses' | 'selected_verses',
    selectedVerseRefs: string[]
  ) {
    if (scope !== 'selected_verses') return selectedInsights
    return selectedInsights.filter(item => refMatchesSelectedVerses(item.verseRef, selectedVerseRefs))
  }

  function openGenerateOutlineFlow() {
    if (hasOutline) {
      setShowReplaceOutlineModal(true)
      return
    }
    setShowDraftOutlineModal(true)
  }

  async function handleDeleteOutlineAndContinue() {
    setDeletingOutline(true)
    try {
      const { saveBlocksAction } = await import('@/app/(app)/[churchSlug]/teaching/[sessionId]/outline-actions')
      const result = await saveBlocksAction(outlineId, sessionId, churchId, [])
      if (result.error) {
        console.error('Failed to clear outline:', result.error)
        return
      }
      setBlocks([])
      setPending(null)
      setOutlineSectionRefs(null)
      setOutlineReferenceTab('scripture')
      setShowReplaceOutlineModal(false)
      setShowDraftOutlineModal(true)
    } catch (error) {
      console.error('Failed to clear outline:', error)
    } finally {
      setDeletingOutline(false)
    }
  }

    return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className={`mb-3 ${focusMode ? 'sticky top-2 z-20 rounded-xl border border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80' : ''}`}>
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 py-2 min-w-0">
<div className="flex items-center gap-2 shrink-0 min-w-0">
<div className="w-9 flex justify-center shrink-0">
  {focusMode ? <TeachingNavToggleButton /> : null}
</div>

  <div className="flex items-center p-1 bg-slate-100 rounded-xl shrink-0">
    <button
      type="button"
      onClick={() => setFocusMode(v => !v)}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-slate-900 shadow-sm hover:bg-slate-50 transition-colors"
      title={focusMode ? 'Expand header' : 'Collapse header'}
    >
      <BookOpen className="w-4 h-4" />
      {lockedStudyMode === 'vbv' ? 'Verse by Verse' : 'Pericope'}
    </button>
  </div>
</div>

          <div className="min-w-0 overflow-x-auto">
            {showOutlinePane ? (
              <div className="flex items-center gap-1.5 px-1 min-w-max">
                {([
                  ['ai', 'AI'],
                  ['notes', 'Notes'],
                ] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setOutlineReferenceTab(tab)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${outlineReferenceTab === tab ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : showSectionRail ? (
              <div className="flex items-center gap-1.5 px-1 min-w-max">
                {sectionChips.map(chip => (
                  <button
                    key={`${chip.idx}-${chip.label}`}
                    type="button"
                    onClick={() => handleSelectSection(chip.idx)}
                    className={`px-2.5 py-1 rounded-full text-[11px] border whitespace-nowrap transition-colors ${activeSectionIdx === chip.idx ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            ) : hasOutline ? (
              <p className="px-1 text-xs text-slate-400 whitespace-nowrap">Build notes in study mode, then open or redraft the outline here.</p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-1.5 shrink-0 min-w-0">
          {showOutlinePane ? (
  <>
    <button
      onClick={() => outlineSaveFn.current?.()}
      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
      title="Save version"
    >
      <Save className="w-3.5 h-3.5" />
    </button>

    <button
      onClick={openGenerateOutlineFlow}
      disabled={deletingOutline}
      className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
      title="Generate outline"
    >
      {deletingOutline ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
      {deletingOutline ? 'Deleting…' : 'Generate Outline'}
    </button>

    {blocks.length > 0 && (
      <button
        onClick={() => setShowExport(true)}
        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        title="Export outline"
      >
        <Share2 className="w-3.5 h-3.5" />
      </button>
    )}
  </>
) : (
  <>

    <button
      onClick={openGenerateOutlineFlow}
      disabled={deletingOutline}
      className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
    >
      {deletingOutline ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
      {deletingOutline ? 'Deleting…' : 'Generate Outline'}
    </button>
  </>
)}
          </div>
        </div>
      </div>

      {showOutlinePane ? (
  <OutlinePanel
    sessionId={sessionId}
    churchId={churchId}
    churchSlug={churchSlug}
    outlineId={outlineId}
    blocks={blocks}
    onBlocksChange={setBlocks}
    selectedFlow={selectedFlow}
    hasValidAIKey={hasValidAIKey}
    estimatedDuration={estimatedDuration}
    initialVerses={verses ?? []}
    initialInsights={insights}
    initialVerseNotes={verseNotes}
    onInsightsChange={setInsights}
    onSaveTrigger={fn => { outlineSaveFn.current = fn }}
    //onAITrigger={fn => { outlineAIFn.current = fn }}
    pending={pending}
    onItemPlaced={handleItemPlaced}
    onPendingFromRef={setPending}
    onCancelPending={() => setPending(null)}
    steps={steps}
    activeSectionVerseRefs={outlineSectionRefs ?? undefined}
    activeReferenceTab={outlineReferenceTab}
    onReferenceTabChange={(tab) => {
      if (tab === 'scripture' || tab === 'notes' || tab === 'ai') setOutlineReferenceTab(tab)
    }}
    sessionTitle={sessionTitle}
    sessionType="Sermon"
    sessionNotes={null}
    scriptureRef={localScriptureRef}
  />
) : (
  <VerseByVersePanel
    key={`study-${pericopeMode}-${activeSectionIdx}-${showOutlinePane ? 'outline' : 'study'}`}
    sessionId={sessionId}
    churchId={churchId}
    scriptureRef={localScriptureRef}
    onScriptureRefSet={setLocalScriptureRef}
    hasValidAIKey={hasValidAIKey}
    flowStructure={legacyFlowStructure}
    estimatedDuration={estimatedDuration}
    verses={verses}
    insights={insights}
    verseNotes={verseNotes}
    onVersesChange={setVerses}
    onInsightsChange={setInsights}
    onVerseNotesChange={setVerseNotes}
    onOutlineGenerated={handleOutlineGenerated}
    onPendingItem={setPending}
    pendingItemId={pending?.sourceId ?? null}
    steps={steps}
    pericopeMode={pericopeMode}
    onPericopeModeChange={setPericopeMode}
    pericopeSections={pericSections}
    onPericopeSectionsChange={setPericSections}
    hasSectionHeaders={hasSectionHeaders}
    onHasSectionHeadersChange={setHasSectionHeaders}
    pericopeSetupComplete={pericopeSetupComplete}
    onPericopeSetupCompleteChange={setPericopeSetupComplete}
    focusMode={focusMode}
    activeSectionIdx={activeSectionIdx}
    onActiveSectionChange={setActiveSectionIdx}
    paneVisibility={{ scripture: true, notes: true, research: true }}
  />
)}

{showDraftOutlineModal && (
  <DraftOutlineModal
    insights={insights}
    verseNotes={verseNotes}
    availableVerseRefs={verses?.map(v => v.verse_ref) ?? []}
    aiLoading={outlineAiLoading}
    hasBlocks={blocks.length > 0}
    onGenerate={(selectedInsights, options) => {
      setShowDraftOutlineModal(false)

      const notesForAI = collectOutlineVerseNotes(options.scope, options.selectedVerseRefs)
      const filteredInsights = collectOutlineInsights(selectedInsights, options.scope, options.selectedVerseRefs)

      outlineAIFn.current = async () => {}
      ;(async () => {
        setOutlineAiLoading(true)
        try {
          const { generateOutlineAction } = await import('@/app/actions/ai')
          const data = await generateOutlineAction({
            sessionId,
            churchId,
            selectedFlow,
            verseNotes: notesForAI,
            selectedInsights: filteredInsights,
            config: {
              scope: options.scope,
              depth: options.depth,
              verseRefs: options.scope === 'selected_verses' ? options.selectedVerseRefs : undefined,
              customSettings: options.depth === 'custom' ? options.customSettings : undefined,
            },
          })

          if (!data.error && data.blocks) {
            await persistGeneratedOutline(data.blocks)
          } else {
            console.error('Outline generation failed:', data.error)
          }
        } finally {
          setOutlineAiLoading(false)
        }
      })()
    }}
    onViewPrompt={(selectedInsights, options) => {
      const notesForAI = collectOutlineVerseNotes(options.scope, options.selectedVerseRefs)
      const filteredInsights = collectOutlineInsights(selectedInsights, options.scope, options.selectedVerseRefs)
    
      const parts = buildOutlinePromptParts({
        selectedFlow,
        selectedInsights: filteredInsights,
        verseNotesForAI: notesForAI,
        thoughts: [],
        sessionEstimatedDuration: estimatedDuration,
        config: {
          scope: options.scope,
          depth: options.depth,
          verseRefs: options.scope === 'selected_verses' ? options.selectedVerseRefs : undefined,
          customSettings: options.depth === 'custom' ? options.customSettings : undefined,
        },
      })
    
      setHumanPromptPreview(
        renderOutlinePromptForHuman({
          session: {
            title: sessionTitle,
            type: 'Sermon',
            scriptureRef: localScriptureRef,
            notes: null,
            estimatedDuration,
            researchDepth: options.depth,
          },
          parts,
          version: 'preview',
        })
      )

      const llmPrompt = renderOutlinePromptForLLM({
        session: {
          title: sessionTitle,
          type: 'Sermon',
          scriptureRef: localScriptureRef,
          notes: null,
          estimatedDuration,
          researchDepth: options.depth,
        },
        parts,
        version: 'preview',
      })
      
      setLlmPromptPreview(
        `${llmPrompt.system}\n\n----- USER -----\n\n${llmPrompt.user}`
      )
    
      setShowPromptPreviewModal(true)
    }}
    onClose={() => setShowDraftOutlineModal(false)}
  />
)}

{showReplaceOutlineModal && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Replace existing outline?</h2>
          <p className="text-xs text-slate-400 mt-0.5">Generating a new outline will delete the current one first.</p>
        </div>
        <button onClick={() => !deletingOutline && setShowReplaceOutlineModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-50" disabled={deletingOutline}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-6 py-4">
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Your current outline will be removed before the new outline prompt opens.
        </div>
      </div>
      <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
        <button
          onClick={() => setShowReplaceOutlineModal(false)}
          disabled={deletingOutline}
          className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleDeleteOutlineAndContinue}
          disabled={deletingOutline}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {deletingOutline ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {deletingOutline ? 'Deleting outline…' : 'Delete and continue'}
        </button>
      </div>
    </div>
  </div>
)}

{showPromptPreviewModal && (
  <PromptPreviewModal
    humanPrompt={humanPromptPreview}
    llmPrompt={llmPromptPreview}
    onClose={() => setShowPromptPreviewModal(false)}
  />
)}




      {showExport && (
        <ExportModal
          blocks={blocks}
          sessionTitle={sessionTitle}
          scriptureRef={scriptureRef}
          scheduledDate={scheduledDate}
          onClose={() => setShowExport(false)}
          onBeforeExport={async () => {
            await outlineSaveFn.current?.()
          }}
        />
      )}

      {pending && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-violet-700 text-white text-sm font-medium rounded-2xl shadow-xl">
          <span className="w-2 h-2 rounded-full bg-violet-300 animate-pulse shrink-0" />
          Tap a drop zone to place
          <button onClick={() => setPending(null)} className="ml-1 text-violet-300 hover:text-white transition-colors text-xs underline">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}