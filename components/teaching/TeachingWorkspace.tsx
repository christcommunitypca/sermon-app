'use client'
import React, { useState, useCallback, useEffect } from 'react'
import { BookOpen, List, Eye, Save, Sparkles, Share2 } from 'lucide-react'
import { VerseByVersePanel } from './VerseByVersePanel'
import { OutlinePanel } from './OutlinePanel'
import { ExportModal } from './ExportModal'
import { updateTeachingModeAction, updateStudyModeAction } from '@/app/actions/verse-study'
import type { OutlineBlock, VerseNote } from '@/types/database'
import type { VerseData } from '@/lib/esv'

// ── Pending placement ─────────────────────────────────────────────────────────
export interface PendingItem {
  content:    string
  type:       OutlineBlock['type']
  sourceKind: 'note' | 'research'
  sourceId:   string
}

export type TeachingMode = 'verse_by_verse' | 'outline' | 'pericope'

// ── Step indicator (shared between both views) ────────────────────────────────
export type StepKey = 'load_text' | 'notes' | 'research' | 'outline' | 'ai_review' | 'publish'

export interface StepState {
  key:        StepKey
  label:      string
  done:       boolean
  inProgress: boolean  // started but not confirmed complete
  active:     boolean
  future:     boolean
}

export function buildSteps(
  hasVerses:   boolean,
  hasNotes:    boolean,
  hasResearch: boolean,
  hasBlocks:   boolean,   // outline has content
  isPublished: boolean,
): StepState[] {
  const steps: { key: StepKey; label: string; done: boolean }[] = [
    { key: 'load_text', label: 'Load Text',     done: hasVerses },
    { key: 'notes',     label: 'Notes',          done: hasNotes },
    { key: 'research',  label: 'Research',       done: hasResearch },
    { key: 'outline',   label: 'Build Outline',  done: false },
    { key: 'ai_review', label: 'AI Review',      done: false },
    { key: 'publish',   label: 'Publish',        done: isPublished },
  ]
  // Active = first undone step
  const firstUndoneIdx = steps.findIndex(s => !s.done)
  return steps.map((s, i) => ({
    ...s,
    inProgress: s.key === 'outline' && hasBlocks && !s.done,
    active: i === firstUndoneIdx,
    future: i > firstUndoneIdx && !s.done,
  }))
}

type Insights = Record<string, Record<string, { title: string; content: string; is_flagged?: boolean; used_count?: number }[]>>

interface Props {
  sessionId:         string
  churchId:          string
  churchSlug:        string
  outlineId:         string
  initialBlocks:     OutlineBlock[]
  flowStructure?:    { type: string; label: string }[]
  hasValidAIKey:     boolean
  scriptureRef:      string | null
  initialMode:       TeachingMode
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

export function TeachingWorkspace({
  sessionId, churchId, churchSlug, outlineId,
  initialBlocks, flowStructure, hasValidAIKey,
  scriptureRef, initialMode, initialStudyMode, estimatedDuration,
  initialVerses, initialInsights, initialVerseNotes,
  isPublished, sessionTitle, scheduledDate,
  initialPericSections, initialHasSectionHeaders, initialPericopeSetupComplete = false,
}: Props) {
  const computedInitialMode: TeachingMode =
  initialMode === 'outline'
    ? 'outline'
    : initialMode === 'pericope'
      ? 'pericope'
      : 'verse_by_verse'

const [mode, setMode] = useState<TeachingMode>(computedInitialMode)
  const [verses,     setVerses]     = useState<VerseData[] | null>(initialVerses)
  const [insights,   setInsights]   = useState<Insights>(initialInsights)
  const [verseNotes, setVerseNotes] = useState<Record<string, VerseNote[]>>(initialVerseNotes)
  const [blocks,     setBlocks]     = useState<OutlineBlock[]>(initialBlocks)
  const [pending,      setPending]      = useState<PendingItem | null>(null)
  const outlineSaveFn = React.useRef<() => Promise<void> | void>(() => {})
  const outlineAIFn   = React.useRef<() => void>(() => {})
  const [localScriptureRef, setLocalScriptureRef] = useState<string | null>(scriptureRef)
  const [showAssist,   setShowAssist]   = useState(false)
  const [showExport,       setShowExport]       = useState(false)
  const [pericopeMode, setPericopeMode] = useState<'vbv' | 'pericope'>(initialStudyMode)
  const [pericSections,    setPericSections]    = useState<Array<{label:string;startVerse:string}>>(initialPericSections ?? [])
  const [hasSectionHeaders, setHasSectionHeaders] = useState(initialHasSectionHeaders ?? false)
  const [pericopeSetupComplete, setPericopeSetupComplete] = useState(
    (initialPericopeSetupComplete ?? false) || (initialPericSections?.length ?? 0) > 0
  )
  const [aiContext,    setAIContext]    = useState<{
    hasBlocks: boolean; aiLoading: boolean;
    onDraft: () => void; onReview: () => void
  } | null>(null)
  
  useEffect(() => {
    if (pericSections.length > 0 && !pericopeSetupComplete) {
      setPericopeSetupComplete(true)
    }
  }, [pericSections, pericopeSetupComplete])
  const aiButtonRef = React.useRef<HTMLButtonElement>(null)

  useEffect(() => {
    updateStudyModeAction(sessionId, pericopeMode).catch(() => null)
  }, [sessionId, pericopeMode])

  function handleModeChange(newMode: TeachingMode) {
    setMode(newMode)
  
    updateTeachingModeAction(
      sessionId,
      newMode === 'outline' ? 'outline' : 'study'
    ).catch(() => null)
  }

  const handleOutlineGenerated = useCallback((newBlocks: OutlineBlock[]) => {
    setBlocks(newBlocks)
    handleModeChange('outline')
  }, [])

  const handleItemPlaced = useCallback((item: PendingItem) => {
    if (item.sourceKind === 'note') {
      setVerseNotes(prev => {
        const next = { ...prev }
        for (const ref of Object.keys(next)) {
          next[ref] = next[ref].map(n =>
            n.id === item.sourceId ? { ...n, used_count: n.used_count + 1 } : n
          )
        }
        return next
      })
    }
    setPending(null)
  }, [])

  // Build step state for both panels
  const hasVerses   = !!verses?.length
  const hasNotes    = Object.values(verseNotes).some(arr => arr.some(n => n.content.trim()))
  const hasResearch = Object.keys(insights).length > 0
  const hasBlocks   = blocks.length > 0
  const steps = buildSteps(hasVerses, hasNotes, hasResearch, hasBlocks, isPublished)

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Mode toggle + icon buttons — one tight row */}
      <div className="flex items-center gap-1.5 mb-3">
        {/* Mode toggle — larger pills */}
        <div className="flex items-center gap-0.5 p-1 bg-slate-100 rounded-xl shrink-0">
          <ModeButton active={mode !== 'outline'} icon={<BookOpen className="w-4 h-4" />}
            label={pericopeMode === 'pericope' ? 'Pericope' : 'Verse by Verse'} onClick={() => handleModeChange('verse_by_verse')} />
          <ModeButton active={mode === 'outline'} icon={<List className="w-4 h-4" />}
            label="Outline" onClick={() => handleModeChange('outline')} />
        </div>

        {/* Save + AI icons — only in outline mode */}
        {mode === 'outline' && (
          <>
            <button onClick={() => outlineSaveFn.current?.()}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Save version">
              <Save className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => outlineAIFn.current?.()}
              className="flex items-center gap-0.5 px-2 py-1.5 text-slate-500 hover:text-violet-700 hover:bg-violet-50 border border-slate-200 hover:border-violet-200 rounded-lg transition-colors text-xs font-medium"
              title="AI Assistance">
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        <a href={`/${churchSlug}/deliver/${sessionId}`} target="_blank" rel="noopener noreferrer"
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          title="Preview delivery mode">
          <Eye className="w-3.5 h-3.5" />
        </a>

        {mode === 'outline' && blocks.length > 0 && (
          <button
            onClick={() => setShowExport(true)}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Export outline"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {mode !== 'outline' ? (
        <VerseByVersePanel
          sessionId={sessionId}
          churchId={churchId}
          scriptureRef={localScriptureRef}
          onScriptureRefSet={setLocalScriptureRef}
          hasValidAIKey={hasValidAIKey}
          flowStructure={flowStructure}
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
        />
      ) : (
        <OutlinePanel
          sessionId={sessionId}
          churchId={churchId}
          churchSlug={churchSlug}
          outlineId={outlineId}
          blocks={blocks}
          onBlocksChange={setBlocks}
          flowStructure={flowStructure}
          hasValidAIKey={hasValidAIKey}
          estimatedDuration={estimatedDuration}
          initialVerses={verses ?? []}
          initialInsights={insights}
          initialVerseNotes={verseNotes}
          onInsightsChange={setInsights}
          onSaveTrigger={fn => { outlineSaveFn.current = fn }}
          onAITrigger={fn => { outlineAIFn.current = fn }}
          onRegisterAIContext={ctx => setAIContext(ctx)}
          pending={pending}
          onItemPlaced={handleItemPlaced}
          onPendingFromRef={setPending}
          onCancelPending={() => setPending(null)}
          steps={steps}
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

      {/* Pending placement banner */}
      {pending && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
          flex items-center gap-3 px-4 py-3
          bg-violet-700 text-white text-sm font-medium rounded-2xl shadow-xl">
          <span className="w-2 h-2 rounded-full bg-violet-300 animate-pulse shrink-0" />
          Tap a drop zone to place
          <button onClick={() => setPending(null)}
            className="ml-1 text-violet-300 hover:text-white transition-colors text-xs underline">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function WorkspaceAssistDropdown({ hasBlocks, aiLoading, onDraftOutline, onOutlineReview, onClose }: {
  hasBlocks: boolean; aiLoading: boolean
  onDraftOutline: () => void; onOutlineReview: () => void; onClose: () => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="absolute left-0 top-full mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
      <div className="p-1.5 space-y-0.5">
        <button
          onClick={onDraftOutline}
          disabled={aiLoading}
          className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left disabled:opacity-40"
        >
          <Sparkles className="w-3.5 h-3.5 text-violet-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-800">{hasBlocks ? 'Redraft AI Outline' : 'AI Outline'}</p>
            <p className="text-xs text-slate-400 mt-0.5">AI builds an outline from your research &amp; notes</p>
          </div>
        </button>
        <div className="h-px bg-slate-100" />
        <button
          onClick={onOutlineReview}
          disabled={!hasBlocks}
          className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left disabled:opacity-40"
        >
          <BookOpen className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-800">Review Outline</p>
            <p className="text-xs text-slate-400 mt-0.5">AI reviews lesson flow, language &amp; structure</p>
          </div>
        </button>
      </div>
    </div>
  )
}

function ModeButton({ active, icon, label, onClick }: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}>
      {icon}{label}
    </button>
  )
}
