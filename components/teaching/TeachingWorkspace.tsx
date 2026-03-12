'use client'
import { StepIndicator } from './StepIndicator'

import React, { useState, useCallback } from 'react'
import { BookOpen, List, Eye, Save, Sparkles } from 'lucide-react'
import { VerseByVersePanel } from './VerseByVersePanel'
import { OutlinePanel } from './OutlinePanel'
import { updateTeachingModeAction } from '@/app/actions/verse-study'
import type { OutlineBlock, VerseNote } from '@/types/database'
import type { VerseData } from '@/lib/esv'

// ── Pending placement ─────────────────────────────────────────────────────────
export interface PendingItem {
  content:    string
  type:       OutlineBlock['type']
  sourceKind: 'note' | 'research'
  sourceId:   string
}

export type TeachingMode = 'verse_by_verse' | 'outline'

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
  estimatedDuration: number | null
  initialVerses:     VerseData[] | null
  initialInsights:   Insights
  initialVerseNotes: Record<string, VerseNote[]>
  isPublished:       boolean
}

export function TeachingWorkspace({
  sessionId, churchId, churchSlug, outlineId,
  initialBlocks, flowStructure, hasValidAIKey,
  scriptureRef, initialMode, estimatedDuration,
  initialVerses, initialInsights, initialVerseNotes,
  isPublished,
}: Props) {
  const computedInitialMode: TeachingMode =
    initialBlocks.length > 0 ? initialMode : 'verse_by_verse'

  const [mode,       setMode]       = useState<TeachingMode>(computedInitialMode)
  const [verses,     setVerses]     = useState<VerseData[] | null>(initialVerses)
  const [insights,   setInsights]   = useState<Insights>(initialInsights)
  const [verseNotes, setVerseNotes] = useState<Record<string, VerseNote[]>>(initialVerseNotes)
  const [blocks,     setBlocks]     = useState<OutlineBlock[]>(initialBlocks)
  const [pending,      setPending]      = useState<PendingItem | null>(null)
  const outlineSaveFn = React.useRef<() => void>(() => {})
  const outlineAIFn   = React.useRef<() => void>(() => {})

  function handleModeChange(newMode: TeachingMode) {
    setMode(newMode)
    updateTeachingModeAction(sessionId, newMode).catch(() => null)
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
      {/* Step indicator — very top, centered */}
      <div className="flex justify-center mb-2">
        <StepIndicator steps={steps} />
      </div>

      {/* Mode toggle + icon buttons — one tight row */}
      <div className="flex items-center gap-1.5 mb-3">
        {/* Mode toggle — larger pills */}
        <div className="flex items-center gap-0.5 p-1 bg-slate-100 rounded-xl shrink-0">
          <ModeButton active={mode === 'verse_by_verse'} icon={<BookOpen className="w-4 h-4" />}
            label="Verse by Verse" onClick={() => handleModeChange('verse_by_verse')} />
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
              className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
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
      </div>

      {mode === 'verse_by_verse' ? (
        <VerseByVersePanel
          sessionId={sessionId}
          churchId={churchId}
          scriptureRef={scriptureRef}
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
          initialInsights={insights}
          initialVerseNotes={verseNotes}
          onInsightsChange={setInsights}
          onSaveTrigger={fn => { outlineSaveFn.current = fn }}
          onAITrigger={fn => { outlineAIFn.current = fn }}
          pending={pending}
          onItemPlaced={handleItemPlaced}
          onPendingFromRef={setPending}
          onCancelPending={() => setPending(null)}
          steps={steps}
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
