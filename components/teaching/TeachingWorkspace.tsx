'use client'

import { useState, useCallback } from 'react'
import { BookOpen, List } from 'lucide-react'
import { VerseByVersePanel } from './VerseByVersePanel'
import { OutlinePanel } from './OutlinePanel'
import { updateTeachingModeAction } from '@/app/actions/verse-study'
import type { OutlineBlock, VerseNote } from '@/types/database'
import type { VerseData } from '@/lib/esv'

export type TeachingMode = 'verse_by_verse' | 'outline'

type Insights = Record<string, Record<string, { title: string; content: string }[]>>

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
}

export function TeachingWorkspace({
  sessionId, churchId, churchSlug, outlineId,
  initialBlocks, flowStructure, hasValidAIKey,
  scriptureRef, initialMode, estimatedDuration,
  initialVerses, initialInsights, initialVerseNotes,
}: Props) {
  // Default: verse_by_verse unless outline already has blocks (user has been here before)
  const computedInitialMode: TeachingMode =
    initialBlocks.length > 0 ? initialMode : 'verse_by_verse'

  const [mode, setMode] = useState<TeachingMode>(computedInitialMode)

  // ── Lifted state — survives mode switches ─────────────────────────────────
  const [verses,     setVerses]     = useState<VerseData[] | null>(initialVerses)
  const [insights,   setInsights]   = useState<Insights>(initialInsights)
  const [verseNotes, setVerseNotes] = useState<Record<string, VerseNote[]>>(initialVerseNotes)
  const [blocks,     setBlocks]     = useState<OutlineBlock[]>(initialBlocks)

  function handleModeChange(newMode: TeachingMode) {
    setMode(newMode)
    updateTeachingModeAction(sessionId, newMode).catch(() => null)
  }

  // When VBV generates an outline, inject blocks and switch to outline mode
  const handleOutlineGenerated = useCallback((newBlocks: OutlineBlock[]) => {
    setBlocks(newBlocks)
    handleModeChange('outline')
  }, [])

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit mb-5">
        <ModeButton active={mode === 'verse_by_verse'} icon={<BookOpen className="w-3.5 h-3.5" />}
          label="Verse by Verse" onClick={() => handleModeChange('verse_by_verse')} />
        <ModeButton active={mode === 'outline'} icon={<List className="w-3.5 h-3.5" />}
          label="Outline" onClick={() => handleModeChange('outline')} />
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
        />
      ) : (
        <OutlinePanel
          sessionId={sessionId}
          churchId={churchId}
          churchSlug={churchSlug}
          outlineId={outlineId}
          initialBlocks={blocks}
          flowStructure={flowStructure}
          hasValidAIKey={hasValidAIKey}
          estimatedDuration={estimatedDuration}
          initialInsights={insights}
          initialVerseNotes={verseNotes}
        />
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