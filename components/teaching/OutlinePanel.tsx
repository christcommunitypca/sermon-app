'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Plus, Trash2, Clock, Save, Sparkles, RotateCcw, Check, X,
  BookMarked, AlertCircle, Bold, Italic, Loader2, BookOpen
} from 'lucide-react'
import { OutlineBlock, VerseNote } from '@/types/database'
import type { PendingItem, StepState } from './TeachingWorkspace'
import { incrementNoteUsedCountAction, incrementInsightUsedCountAction } from '@/app/actions/verse-study'
import { AISourceBadge } from './AISourceBadge'
import { OutlineReference } from './OutlineReference'
import { LessonSummaryModal } from './LessonSummaryModal'
import {
  getFlatRenderOrder, getSortedChildren, getDepth,
  moveUp, moveDown, promote, demote,
  createLocalBlock, normalizePositions, totalEstimatedMinutes,
  getDescendantIds
} from '@/lib/outline'
import { saveBlocksAction, createManualSnapshotAction } from '@/app/(app)/[churchSlug]/teaching/[sessionId]/outline-actions'
import { generateOutlineAction } from '@/app/actions/ai'

import {
  buildOutlinePromptParts,
  renderOutlinePromptForHuman,
  renderOutlinePromptForLLM,
  type OutlineSelectedFlow,
  type OutlineSelectedInsight,
} from '@/lib/outlinePrompt'

const BLOCK_TYPE_LABELS: Record<OutlineBlock['type'], string> = {
  point: 'Point',
  sub_point: 'Sub-point',
  scripture: 'Scripture',
  illustration: 'Illustration',
  application: 'Application',
  transition: 'Transition',
}

// Visual weight per block type — section headers get bold + larger styling
const BLOCK_IS_SECTION = (type: OutlineBlock['type']) =>
  type === 'point'

const BLOCK_BORDER_COLORS: Record<OutlineBlock['type'], string> = {
  point: 'border-l-slate-500',
  sub_point: 'border-l-slate-300',
  scripture: 'border-l-blue-400',
  illustration: 'border-l-amber-400',
  application: 'border-l-emerald-400',
  transition: 'border-l-purple-300',
}

const MAX_DEPTH = 4



type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type Insights = Record<string, Record<string, { title: string; content: string; is_flagged?: boolean; used_count?: number }[]>>

interface Props {
  outlineId: string
  sessionId: string
  churchId: string
  churchSlug: string
  blocks: OutlineBlock[]
  onBlocksChange: (blocks: OutlineBlock[]) => void
  selectedFlow?: OutlineSelectedFlow | null
  hasValidAIKey: boolean
  estimatedDuration: number | null
  initialVerses: Array<{ verse_ref: string; text: string }>
  initialInsights: Insights
  initialVerseNotes: Record<string, VerseNote[]>
  onInsightsChange: (insights: Insights) => void
  onSaveTrigger?:        (fn: () => void) => void
  onAITrigger?:          (fn: () => void) => void
  onRegisterAIContext?:  (ctx: { hasBlocks: boolean; aiLoading: boolean; onDraft: () => void; onReview: () => void }) => void
  pending:          PendingItem | null
  onItemPlaced:     (item: PendingItem) => void
  onPendingFromRef: (item: PendingItem) => void
  onCancelPending:  () => void
  steps:            StepState[]
  activeReferenceTab?: 'notes' | 'ai'
  onReferenceTabChange?: (tab: 'notes' | 'ai') => void
  activeSectionVerseRefs?: string[]
  sessionTitle: string
  sessionType: string
  sessionNotes?: string | null
  scriptureRef?: string | null
}

export function OutlinePanel({
  outlineId, sessionId, churchId, churchSlug,
  blocks, onBlocksChange, selectedFlow, hasValidAIKey,
  estimatedDuration, sessionTitle, sessionType, sessionNotes, scriptureRef, initialVerses, initialInsights, initialVerseNotes,
  onInsightsChange, onSaveTrigger, onAITrigger, onRegisterAIContext, pending, onItemPlaced, 
  onPendingFromRef, onCancelPending, steps, activeReferenceTab, onReferenceTabChange,  activeSectionVerseRefs,
}: Props) {
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [showSnapshotInput, setShowSnapshotInput] = useState(false)
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [showSummary,   setShowSummary]   = useState(false)
  const [showAssist,    setShowAssist]    = useState(false)
  const [showDraftModal, setShowDraftModal] = useState(false)

  const [showPromptModal, setShowPromptModal] = useState(false)
  const [promptPreview, setPromptPreview] = useState('')
  const [llmPromptPreview, setLlmPromptPreview] = useState('')
  // AI state
  const [aiLoading, setAILoading] = useState(false)
  const [aiProposed,   setAIProposed]   = useState<OutlineBlock[] | null>(null)
  const [aiError,      setAIError]      = useState<string | null>(null)
  const [hiddenVerses, setHiddenVerses] = useState<Set<string>>(new Set())
  

  // Register external trigger callbacks so workspace toolbar can fire these
  useEffect(() => {
    onSaveTrigger?.(() => { flushSave().catch(() => null) })    
    onAITrigger?.(() => {
      setShowAssist(false)
      setShowDraftModal(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  // Keep workspace informed of AI context (hasBlocks, aiLoading, callbacks)
  useEffect(() => {
    onRegisterAIContext?.({
      hasBlocks: blocks.length > 0,
      aiLoading,
      onDraft:  () => { setShowAssist(false); setShowDraftModal(true) },
      onReview: () => { setShowAssist(false); setShowSummary(true) },
    })
  }, [blocks.length, aiLoading])

  useEffect(() => {
    latestBlocksRef.current = blocks
  }, [blocks])

  function toggleVerse(ref: string) {
    setHiddenVerses(prev => { const n = new Set(prev); n.has(ref) ? n.delete(ref) : n.add(ref); return n })
  }

  const allVerseRefs = Array.from(new Set([
    ...Object.keys(initialVerseNotes).filter(r => initialVerseNotes[r].some(n => n.content.trim())),
    ...Object.keys(initialInsights),
  ])).sort()

  const scopedVerseRefs = activeSectionVerseRefs?.length
  ? allVerseRefs.filter(ref => activeSectionVerseRefs.includes(ref))
  : allVerseRefs

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestBlocksRef = useRef<OutlineBlock[]>(blocks)
  const flatBlocks = getFlatRenderOrder(blocks)
  const totalMins = totalEstimatedMinutes(blocks)
  const targetMins = estimatedDuration ?? 0
  const overTarget = targetMins > 0 && totalMins > targetMins
  const underTarget = targetMins > 0 && totalMins < targetMins * 0.85
  const pct = targetMins > 0 ? Math.min((totalMins / targetMins) * 100, 100) : 0

  // ── Auto-save ────────────────────────────────────────────────────────────────
  const scheduleSave = useCallback((newBlocks: OutlineBlock[]) => {
    latestBlocksRef.current = newBlocks
  
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveState('saving')
  
    saveTimerRef.current = setTimeout(async () => {
      saveTimerRef.current = null
      const result = await saveBlocksAction(outlineId, sessionId, churchId, newBlocks)
      if (result.error) {
        setSaveState('error')
      } else {
        setSaveState('saved')
        setLastSaved(new Date())
      }
    }, 800)
  }, [outlineId, sessionId, churchId])
  
  async function flushSave() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  
    setSaveState('saving')
    const result = await saveBlocksAction(outlineId, sessionId, churchId, latestBlocksRef.current)
  
    if (result.error) {
      setSaveState('error')
      console.error('flushSave failed:', result.error)
    } else {
      setSaveState('saved')
      setLastSaved(new Date())
    }
  }
  
  function update(newBlocks: OutlineBlock[]) {
    onBlocksChange(newBlocks)
    scheduleSave(newBlocks)
  }

  // ── Block operations ─────────────────────────────────────────────────────────
  function handleContentChange(id: string, value: string) {
    const newBlocks = blocks.map((b: OutlineBlock) => {
      if (b.id !== id) return b
      const updated = { ...b, content: value }
      if (b.ai_source && !b.ai_edited) return { ...updated, ai_edited: true }
      return updated
    })
    update(newBlocks)
  }

  function handleTypeChange(id: string, type: OutlineBlock['type']) {
    update(blocks.map((b: OutlineBlock) => b.id === id ? { ...b, type } : b))
  }

  function handleMinutesChange(id: string, value: string) {
    const mins = value === '' ? null : parseFloat(value)
    update(blocks.map((b: OutlineBlock) => b.id === id ? { ...b, estimated_minutes: isNaN(mins ?? NaN) ? null : mins } : b))
  }

  function handleMoveUp(id: string) { update(moveUp(blocks, id)) }
  function handleMoveDown(id: string) { update(moveDown(blocks, id)) }
  function handlePromote(id: string) {
    const promoted = promote(blocks, id)
    // If promoted to root level (no parent), convert sub_point → point
    const block = promoted.find(b => b.id === id)
    if (block && !block.parent_id && block.type === 'sub_point') {
      update(promoted.map(b => b.id === id ? { ...b, type: 'point' as const } : b))
    } else {
      update(promoted)
    }
  }
  function handleDemote(id: string) {
    const demoted = demote(blocks, id)
    // If demoted under a parent, convert point → sub_point
    const block = demoted.find(b => b.id === id)
    if (block && block.parent_id && block.type === 'point') {
      update(demoted.map(b => b.id === id ? { ...b, type: 'sub_point' as const } : b))
    } else {
      update(demoted)
    }
  }

  function handleAddBelow(afterId: string) {
    const anchor = blocks.find((b: OutlineBlock) => b.id === afterId)
    if (!anchor) return
    const shifted = blocks.map((b: OutlineBlock) => {
      if (b.parent_id === anchor.parent_id && b.position > anchor.position)
        return { ...b, position: b.position + 1 }
      return b
    })
    const newBlock = createLocalBlock(outlineId, anchor.parent_id, anchor.type, anchor.position + 1)
    update(normalizePositions([...shifted, newBlock]))
  }

  function handleAddSubPoint(parentId: string) {
    const children = getSortedChildren(blocks, parentId)
    const newBlock = createLocalBlock(outlineId, parentId, 'sub_point', children.length)
    update([...blocks, newBlock])
  }

  function handleDelete(id: string) {
    const descendantIds = getDescendantIds(blocks, id)
    const toRemove = new Set([id, ...descendantIds])
    update(normalizePositions(blocks.filter((b: OutlineBlock) => !toRemove.has(b.id))))
  }

  // Add block from reference panel (direct, no pending)
  function handleAddFromReference(block: OutlineBlock) {
    const topLevel = getSortedChildren(blocks, null) as OutlineBlock[]
    const positioned = { ...block, position: topLevel.length }
    update(normalizePositions([...blocks, positioned]))
  }

  // Place a pending item at a specific position in the flat render order
  // afterBlockId = null means "insert at top", otherwise insert after that block
  async function handleDropZone(afterBlockId: string | null) {
    if (!pending) return
    const newBlock = createLocalBlock(outlineId, null, pending.type, 0)
    const filled   = { ...newBlock, content: pending.content }
    let nextBlocks: OutlineBlock[]

    if (afterBlockId === null) {
      // Insert at top — shift everything down
      nextBlocks = normalizePositions([
        { ...filled, parent_id: null, position: 0 },
        ...blocks,
      ])
    } else {
      const flat = getFlatRenderOrder(blocks)
      const afterIdx = flat.findIndex(b => b.id === afterBlockId)
      const afterBlock = flat[afterIdx]
      // Inherit parent from the block we're inserting after
      const withParent = { ...filled, parent_id: afterBlock?.parent_id ?? null }
      const inserted = [...blocks, withParent]
      nextBlocks = normalizePositions(inserted)
      // Move to right position using move operations
      // Simpler: rebuild flat order and renumber positions
      // Actually — insert into the flat list after afterIdx, then rebuild
      const flatWithNew = [...flat.slice(0, afterIdx + 1), withParent, ...flat.slice(afterIdx + 1)]
      // Rebuild position by traversal — use the flat order to assign positions
      nextBlocks = flatWithNew.map((b, i) => ({ ...b, position: i }))
    }

    update(nextBlocks)

    // Fire used_count increments in background
    if (pending.sourceKind === 'note') {
      incrementNoteUsedCountAction(pending.sourceId).catch(() => null)
    } else {
      // sourceId format: "${verseRef}-${category}-${index}"
      // Split on last two dashes to get parts
      const parts = pending.sourceId.match(/^(.+)-([^-]+)-(\d+)$/)
      if (parts) {
        const [, verseRef, category, idxStr] = parts
        const idx = parseInt(idxStr, 10)
        // Optimistic update in workspace insights
        onInsightsChange({
          ...initialInsights,
          [verseRef]: {
            ...(initialInsights[verseRef] ?? {}),
            [category]: (initialInsights[verseRef]?.[category] ?? []).map((it, i) =>
              i === idx ? { ...it, used_count: (it.used_count ?? 0) + 1 } : it
            ),
          },
        })
        incrementInsightUsedCountAction(sessionId, verseRef, category, idx).catch(() => null)
      }
    }

    onItemPlaced(pending)
  }

  // ── Snapshot ─────────────────────────────────────────────────────────────────
  async function handleManualSnapshot() {
    setSavingSnapshot(true)
    const result = await createManualSnapshotAction(sessionId, outlineId, churchId, snapshotLabel)
    setSavingSnapshot(false)
    if (!result.error) {
      setSnapshotLabel('')
      setShowSnapshotInput(false)
    }
  }

  function handleViewPrompt(
    selectedInsights?: OutlineSelectedInsight[],
    verseNotesForAI?: Record<string, string>
  ) {
    const parts = buildOutlinePromptParts({
      selectedFlow,
      selectedInsights,
      verseNotesForAI,
      thoughts: [],
      sessionEstimatedDuration: estimatedDuration,
    })

    const sessionForPreview = {
      title: sessionTitle || 'Preview from current teaching workspace',
      type: sessionType || 'Sermon',
      scriptureRef: scriptureRef ?? initialVerses?.[0]?.verse_ref ?? null,
      notes: sessionNotes ?? null,
      estimatedDuration,
    }

    const preview = renderOutlinePromptForHuman({
      session: sessionForPreview,
      parts,
      version: 'preview',
    })

    const llmPrompt = renderOutlinePromptForLLM({
      session: sessionForPreview,
      parts,
      version: 'preview',
    })

    setPromptPreview(preview)
    setLlmPromptPreview(`${llmPrompt.system}\n\n----- USER -----\n\n${llmPrompt.user}`)
    setShowPromptModal(true)
  }
  
  // ── AI generation ────────────────────────────────────────────────────────────
  async function handleGenerateAI(
    selectedInsights?: OutlineSelectedInsight[],
    verseNotesForAI?: Record<string, string>
  ) {
    setAILoading(true)
    setAIError(null)
    try {
      const data = await generateOutlineAction({
        sessionId,
        churchId,
        selectedFlow,
        selectedInsights,
        verseNotes: verseNotesForAI,
      })

      if (data.error || !data.blocks) {
        setAIError(data.error ?? 'Generation failed')
      } else {
        setAIProposed(data.blocks)
      }
    } catch (err) {
      setAIError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setAILoading(false)
    }
  }

  function handleAcceptAI() {
    if (!aiProposed) return
    update(aiProposed)
    setAIProposed(null)
  }

  
  // function buildOutlinePromptParts(
  //   selectedInsights?: { verseRef: string; category: string; title: string; content: string }[],
  //   verseNotesForAI?: Record<string, string>
  // ) {
  //   return {
  //     request: [
  //       'Build a clear, faithful, sermon-ready outline based on the material below.',
  //       'Produce an outline, not a manuscript.',
  //       'Use concise, pulpit-friendly wording.',
  //       'Organize the material according to the requested sermon flow if one is provided.',
  //       'Use the notes and insights as source material, but rewrite them into natural sermon-outline language.',
  //       'Prefer clarity, theological faithfulness, and strong movement between points.',
  //       'Include major points and sub-points where appropriate.',
  //       'Do not include filler commentary about the process.',
  //     ],
  //     flowStructure: flowStructure?.length
  //       ? flowStructure.map(s => ({ label: s.label, type: s.type }))
  //       : [],
  //     verseNotes: verseNotesForAI ?? {},
  //     selectedInsights: selectedInsights ?? [],
  //   }
  // }
  
  // function renderOutlinePromptForLLM(parts: ReturnType<typeof buildOutlinePromptParts>) {
  //   const flowText = parts.flowStructure.length
  //     ? parts.flowStructure.map(s => `- ${s.label} (${s.type})`).join('\n')
  //     : 'No specific flow structure provided.'
  
  //   const notesText = Object.keys(parts.verseNotes).length
  //     ? Object.entries(parts.verseNotes)
  //         .map(([verseRef, noteText]) => `## ${verseRef}\n${noteText}`)
  //         .join('\n\n')
  //     : 'No verse notes provided.'
  
  //   const insightsText = parts.selectedInsights.length
  //     ? parts.selectedInsights
  //         .map(item => {
  //           const titleLine = item.title ? `Title: ${item.title}\n` : ''
  //           return `## ${item.verseRef} | ${item.category}\n${titleLine}${item.content}`
  //         })
  //         .join('\n\n')
  //     : 'No selected insights provided.'
  
  //   return `You are helping generate a sermon outline.
  
  // ${parts.request.join('\n')}
  
  // FLOW STRUCTURE
  // ${flowText}
  
  // VERSE NOTES
  // ${notesText}
  
  // SELECTED INSIGHTS
  // ${insightsText}`
  // }
  
  // function renderOutlinePromptForHuman(parts: ReturnType<typeof buildOutlinePromptParts>) {
  //   const lines: string[] = []
  
  //   lines.push('OUTLINE PROMPT PREVIEW')
  //   lines.push('')
  //   lines.push('REQUEST')
  //   parts.request.forEach(line => lines.push(`- ${line}`))
  //   lines.push('')
  
  //   lines.push('FLOW STRUCTURE')
  //   if (parts.flowStructure.length) {
  //     parts.flowStructure.forEach(item => {
  //       lines.push(`- ${item.label} (${item.type})`)
  //     })
  //   } else {
  //     lines.push('No specific flow structure provided.')
  //   }
  //   lines.push('')
  
  //   lines.push('VERSE NOTES')
  //   if (Object.keys(parts.verseNotes).length) {
  //     Object.entries(parts.verseNotes).forEach(([verseRef, noteText]) => {
  //       lines.push(verseRef)
  //       lines.push(noteText)
  //       lines.push('')
  //     })
  //   } else {
  //     lines.push('No verse notes provided.')
  //     lines.push('')
  //   }
  
  //   lines.push('SELECTED INSIGHTS')
  //   if (parts.selectedInsights.length) {
  //     parts.selectedInsights.forEach(item => {
  //       lines.push(`${item.verseRef} | ${item.category}`)
  //       if (item.title) lines.push(`Title: ${item.title}`)
  //       lines.push(item.content)
  //       lines.push('')
  //     })
  //   } else {
  //     lines.push('No selected insights provided.')
  //     lines.push('')
  //   }
  
  //   return lines.join('\n')
  // }

  return (
    <>
    <div className="flex gap-3 min-h-[600px] overflow-x-hidden">
      {/* ── Left: Outline editor ─────────────────────────────────────────── */}
      <div className="w-[48%] min-w-0 flex-shrink-0 flex flex-col gap-3 relative">
        {/* Snapshot input — shown inline when triggered from workspace toolbar */}
        {showSnapshotInput && (
          <div className="flex items-center gap-1">
            <input
              value={snapshotLabel}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSnapshotLabel(e.target.value)}
              placeholder="Version label…"
              className="text-xs px-2 py-1 border border-slate-300 rounded-lg w-36 focus:outline-none focus:ring-1 focus:ring-slate-400"
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleManualSnapshot()}
              autoFocus
            />
            <button onClick={handleManualSnapshot} disabled={savingSnapshot}
              className="p-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowSnapshotInput(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* AssistDropdown now rendered in TeachingWorkspace toolbar, anchored to AI button */}

        {/* Save state indicator */}
        <SaveIndicator state={saveState} lastSaved={lastSaved} />

        {/* Time bar — shown below toolbar when target is set */}
        {targetMins > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${overTarget ? 'bg-red-400' : underTarget ? 'bg-amber-400' : 'bg-emerald-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={`text-xs font-medium whitespace-nowrap ${overTarget ? 'text-red-600' : underTarget ? 'text-amber-600' : 'text-slate-500'}`}>
              {totalMins}/{targetMins}m
              {overTarget && <span className="font-normal"> over</span>}
              {underTarget && <span className="font-normal"> under</span>}
            </span>
          </div>
        )}
        {totalMins > 0 && targetMins === 0 && (
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />{totalMins} min est.
          </span>
        )}

        {/* AI error */}
        {aiError && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {aiError}
            </div>
            <button onClick={() => setAIError(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* AI proposal */}
        {aiProposed && (
          <AIProposalBanner
            blocks={aiProposed}
            onAccept={handleAcceptAI}
            onDiscard={() => setAIProposed(null)}
          />
        )}

        {/* Block list — with drop zones when pending */}
        <div className="space-y-0">
          {flatBlocks.length === 0 ? (
            pending ? (
              <DropZone afterBlockId={null} onDrop={handleDropZone} />
            ) : (
              <EmptyOutline outlineId={outlineId} onAdd={b => update([b])} />
            )
          ) : (
            <>
              {pending && <DropZone afterBlockId={null} onDrop={handleDropZone} />}
              {flatBlocks.map((block, i) => {
                const depth = getDepth(blocks, block.id)
                const siblings = getSortedChildren(blocks, block.parent_id) as OutlineBlock[]
                const idx = siblings.findIndex(b => b.id === block.id)
                return (
                  <div key={block.id}>
                    <BlockRow
                      block={block}
                      depth={depth}
                      canMoveUp={idx > 0}
                      canMoveDown={idx < siblings.length - 1}
                      canPromote={!!block.parent_id}
                      canDemote={idx > 0 && depth < MAX_DEPTH}
                      onContentChange={handleContentChange}
                      onTypeChange={handleTypeChange}
                      onMinutesChange={handleMinutesChange}
                      onMoveUp={() => handleMoveUp(block.id)}
                      onMoveDown={() => handleMoveDown(block.id)}
                      onPromote={() => handlePromote(block.id)}
                      onDemote={() => handleDemote(block.id)}
                      onAddBelow={() => handleAddBelow(block.id)}
                      onAddSubPoint={() => handleAddSubPoint(block.id)}
                      onDelete={() => handleDelete(block.id)}
                      dimmed={!!pending}
                    />
                    {pending && <DropZone afterBlockId={block.id} onDrop={handleDropZone} />}
                  </div>
                )
              })}
            </>
          )}
        </div>

        {flatBlocks.length > 0 && (
          <button
            onClick={() => {
              const topLevel = getSortedChildren(blocks, null)
              const newBlock = createLocalBlock(outlineId, null, 'point', topLevel.length)
              update([...blocks, newBlock])
            }}
            className="w-full py-2 text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg hover:text-slate-600 hover:border-slate-300 transition-colors"
          >
            + Add point
          </button>
        )}
      </div>

      {/* ── Right: Reference panel ───────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto flex flex-col gap-2 min-h-0">
        <OutlineReference
          verses={initialVerses}
          insights={initialInsights}
          verseNotes={initialVerseNotes}
          hiddenVerses={hiddenVerses}
          allVerseRefs={scopedVerseRefs}
          onToggleVerse={toggleVerse}
          sessionId={sessionId}
          pendingItemId={pending?.sourceId ?? null}
          onPendingItem={onPendingFromRef}
          onInsightsChange={onInsightsChange}
          activeTab={activeReferenceTab}
          onActiveTabChange={(tab) => {
            if (tab === 'notes' || tab === 'ai') onReferenceTabChange?.(tab)
          }}
          hideTopTabs
        />
      </div>

      {/* Lesson summary modal */}
      {showSummary && (
        <LessonSummaryModal
          sessionId={sessionId}
          blocks={blocks}
          onClose={() => setShowSummary(false)}
        />
      )}

      {showDraftModal && (
        <DraftOutlineModal
          insights={initialInsights}
          verseNotes={initialVerseNotes}
          aiLoading={aiLoading}
          hasBlocks={blocks.length > 0}
          onGenerate={(selectedInsights) => {
            setShowDraftModal(false)
            // Bundle notes for AI
            const notesForAI: Record<string, string> = {}
            for (const [vRef, notes] of Object.entries(initialVerseNotes)) {
              const text = notes.filter(n => n.content.trim()).map(n => n.content).join('\n')
              if (text) notesForAI[vRef] = text
            }
            handleGenerateAI(selectedInsights, notesForAI)
          }}
          onViewPrompt={(selectedInsights) => {
            const notesForAI: Record<string, string> = {}
            for (const [vRef, notes] of Object.entries(initialVerseNotes)) {
              const text = notes.filter(n => n.content.trim()).map(n => n.content).join('\n')
              if (text) notesForAI[vRef] = text
            }
            handleViewPrompt(selectedInsights, notesForAI)
          }}
          onClose={() => setShowDraftModal(false)}
        />
      )}
      {/* {showDraftModal && (
  <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
    <div className="bg-white rounded-2xl shadow-2xl p-8 text-black text-lg font-semibold">
      DRAFT MODAL TEST
    </div>
  </div>
)} */}

      {showPromptModal && (
        <PromptPreviewModal
          humanPrompt={promptPreview}
          llmPrompt={llmPromptPreview}
          onClose={() => setShowPromptModal(false)}
        />
      )}
    </div>
    </>
  )
}

export function PromptPreviewModal({
  humanPrompt,
  llmPrompt,
  onClose,
}: {
  humanPrompt: string
  llmPrompt: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [activeView, setActiveView] = useState<'human' | 'llm'>('human')
  const displayedPrompt = activeView === 'human' ? humanPrompt : llmPrompt
 

 
  async function handleCopy() {
    await navigator.clipboard.writeText(displayedPrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Outline Prompt Preview</h2>
            <p className="text-xs text-slate-400 mt-0.5">Review or copy the prompt payload before sending to AI.</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">

        <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setActiveView('human')}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                activeView === 'human'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              Human Readable
            </button>

            <button
              onClick={() => setActiveView('llm')}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                activeView === 'llm'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              LLM Prompt
            </button>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-auto">
  {activeView === 'human' ? (
    <ReadablePromptView content={displayedPrompt} />
  ) : (
    <pre className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
      {displayedPrompt}
    </pre>
  )}
</div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Close
          </button>

          <button
            onClick={handleCopy}
            className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            {copied ? 'Copied' : 'Copy to Clipboard'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReadablePromptView({ content }: { content: string }) {
  const lines = content.split('\n')

  function isLabelValueLine(line: string) {
    return /^(Title|Type|Scripture|Notes|Version|Temperature|Target delivery time):\s/.test(line)
  }

  function splitLabelValue(line: string) {
    const idx = line.indexOf(':')
    if (idx === -1) return { label: line, value: '' }
    return {
      label: line.slice(0, idx),
      value: line.slice(idx + 1).trim(),
    }
  }

  return (
    <div className="space-y-1 text-sm text-slate-700">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim()

        if (!line) {
          return <div key={idx} className="h-2" />
        }

        if (line.startsWith('# ')) {
          return (
            <h1 key={idx} className="text-lg font-bold text-slate-900">
              {line.slice(2)}
            </h1>
          )
        }

        if (line.startsWith('## ')) {
          return (
            <h2 key={idx} className="pt-3 text-sm font-bold uppercase tracking-wide text-slate-900 border-t border-slate-200 first:border-t-0 first:pt-0">
              {line.slice(3)}
            </h2>
          )
        }

        if (line.startsWith('### ')) {
          return (
            <h3 key={idx} className="pt-1 text-sm font-semibold text-slate-800">
              {line.slice(4)}
            </h3>
          )
        }

        if (isLabelValueLine(line)) {
          const { label, value } = splitLabelValue(line)
          return (
            <div key={idx} className="grid grid-cols-[170px_1fr] gap-3 leading-relaxed">
              <div className="font-semibold text-slate-900">{label}</div>
              <div className="text-slate-700 break-words">{value || '—'}</div>
            </div>
          )
        }

        if (/^\d+\.\s/.test(line)) {
          const number = line.match(/^\d+\./)?.[0] ?? ''
          const text = line.replace(/^\d+\.\s/, '')
          return (
            <div key={idx} className="grid grid-cols-[24px_1fr] gap-2 leading-relaxed">
              <div className="font-semibold text-slate-900">{number}</div>
              <div>{text}</div>
            </div>
          )
        }

        if (line.startsWith('- ')) {
          return (
            <div key={idx} className="grid grid-cols-[16px_1fr] gap-2 leading-relaxed">
              <div className="font-semibold text-slate-900">•</div>
              <div>{line.slice(2)}</div>
            </div>
          )
        }

        if (line.startsWith('[') && line.includes(']')) {
          const closing = line.indexOf(']')
          const tag = line.slice(0, closing + 1)
          const rest = line.slice(closing + 1).trim()
          return (
            <div key={idx} className="grid grid-cols-[180px_1fr] gap-3 leading-relaxed">
              <div className="font-mono text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded px-2 py-1 w-fit">
                {tag}
              </div>
              <div>{rest}</div>
            </div>
          )
        }

        return (
          <p key={idx} className="leading-relaxed">
            {line}
          </p>
        )
      })}
    </div>
  )
}
// ── BlockRow ───────────────────────────────────────────────────────────────────


// ── Inline formatting helpers ─────────────────────────────────────────────────
function wrapSelection(
  textarea: HTMLTextAreaElement,
  marker: string,
  onChange: (val: string) => void
) {
  const start = textarea.selectionStart
  const end   = textarea.selectionEnd
  if (start === end) return  // nothing selected
  const val     = textarea.value
  const before  = val.slice(0, start)
  const sel     = val.slice(start, end)
  const after   = val.slice(end)
  const wrapped = `${marker}${sel}${marker}`
  const next    = before + wrapped + after
  onChange(next)
  // Restore selection after React re-render
  requestAnimationFrame(() => {
    textarea.selectionStart = start
    textarea.selectionEnd   = end + marker.length * 2
    textarea.focus()
  })
}

// Render inline **bold** and _italic_ markers as HTML for delivery/preview
export function renderInlineMarkup(text: string): React.ReactNode {
  // Split on **...** and _..._
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('_') && part.endsWith('_'))
      return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

interface BlockRowProps {
  key?: string  // React key, not used in component but accepted by TS
  block: OutlineBlock
  depth: number
  canMoveUp: boolean
  canMoveDown: boolean
  canPromote: boolean
  canDemote: boolean
  onContentChange: (id: string, val: string) => void
  onTypeChange: (id: string, type: OutlineBlock['type']) => void
  onMinutesChange: (id: string, val: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onPromote: () => void
  onDemote: () => void
  onAddBelow: () => void
  onAddSubPoint: () => void
  onDelete: () => void
  dimmed?: boolean
}

function BlockRow({
  block, depth, dimmed = false, canMoveUp, canMoveDown, canPromote, canDemote,
  onContentChange, onTypeChange, onMinutesChange,
  onMoveUp, onMoveDown, onPromote, onDemote, onAddBelow, onAddSubPoint, onDelete
}: BlockRowProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [showMinutes, setShowMinutes] = useState(!!block.estimated_minutes)
  const isSection = BLOCK_IS_SECTION(block.type) && depth === 0
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea on mount so initial content is fully visible
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [])

  return (
    <div
      className={`group relative flex gap-2 items-start border rounded-xl pl-3 pr-2 border-l-4 transition-shadow hover:shadow-sm
        ${BLOCK_BORDER_COLORS[block.type]}
        ${isSection
          ? 'bg-slate-50 border-slate-200 py-3 mt-2'
          : 'bg-white border-slate-100 py-2'
        }
        ${dimmed ? 'opacity-40 pointer-events-none select-none' : ''}
      `}
      style={{ marginLeft: `${depth * 24}px` }}

    >
      {/* Type selector — sub_points show Sub-N based on nesting depth */}
      <div className="relative shrink-0">
        <select
          value={block.type}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onTypeChange(block.id, e.target.value as OutlineBlock['type'])}
          className="text-xs text-slate-400 bg-transparent border-none focus:outline-none cursor-pointer py-1 -ml-1 max-w-[90px] opacity-0 absolute inset-0 w-full"
        >
          {Object.entries(BLOCK_TYPE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <span className="text-xs text-slate-400 py-1 pr-1 select-none pointer-events-none">
          {BLOCK_TYPE_LABELS[block.type]}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Bold/italic mini-toolbar — appears on focus */}
        <div className="flex gap-0.5 mb-1">
            <button
              type="button"
              onMouseDown={(e: React.MouseEvent) => {
                e.preventDefault()
                if (textareaRef.current) wrapSelection(textareaRef.current, '**', (val) => onContentChange(block.id, val))
              }}
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Bold (select text first)"
            ><Bold className="w-3 h-3" /></button>
            <button
              type="button"
              onMouseDown={(e: React.MouseEvent) => {
                e.preventDefault()
                if (textareaRef.current) wrapSelection(textareaRef.current, '_', (val) => onContentChange(block.id, val))
              }}
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Italic (select text first)"
            ><Italic className="w-3 h-3" /></button>
        </div>
        <div className="relative">
        <textarea
          ref={textareaRef}
          value={block.content}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onContentChange(block.id, e.target.value)}
          className={`w-full bg-transparent border-none focus:outline-none resize-none leading-relaxed placeholder:text-slate-300
            ${isSection ? 'text-lg font-bold text-slate-900' : 'text-sm text-slate-800'}
            ${isFocused ? '' : 'caret-transparent select-none text-transparent'}
          `}
          rows={1}
          placeholder={`Add ${BLOCK_TYPE_LABELS[block.type].toLowerCase()}…`}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            const mod = e.metaKey || e.ctrlKey
            if (mod && e.key === 'b') { e.preventDefault(); wrapSelection(e.currentTarget, '**', (val) => onContentChange(block.id, val)) }
            if (mod && e.key === 'i') { e.preventDefault(); wrapSelection(e.currentTarget, '_',  (val) => onContentChange(block.id, val)) }
          }}
          onInput={(e: React.FormEvent<HTMLTextAreaElement>) => {
            const el = e.target as HTMLTextAreaElement
            el.style.height = 'auto'
            el.style.height = `${el.scrollHeight}px`
          }}
        />
        {/* Formatted preview overlay — hidden when textarea is focused */}
        {!isFocused && block.content && (
          <div
            onClick={() => textareaRef.current?.focus()}
            className={`absolute inset-0 pointer-events-none leading-relaxed px-0 py-0 ${
              isSection ? 'text-lg font-bold text-slate-900' : 'text-sm text-slate-800'
            }`}
            style={{ paddingTop: isSection ? '12px' : '8px', paddingLeft: '0px' }}
          >
            {renderInlineMarkup(block.content)}
          </div>
        )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <AISourceBadge aiSource={block.ai_source} aiEdited={block.ai_edited} />
          {showMinutes && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-300" />
              <input
                type="number"
                value={block.estimated_minutes ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onMinutesChange(block.id, e.target.value)}
                placeholder="min"
                min="0" max="120" step="0.5"
                className="w-12 text-xs text-slate-500 border-none bg-transparent focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 flex flex-col gap-0.5">
        <div className="flex gap-0.5">
          <IconBtn onClick={onMoveUp} disabled={!canMoveUp} title="Move up"><ChevronUp className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onMoveDown} disabled={!canMoveDown} title="Move down"><ChevronDown className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onPromote} disabled={!canPromote} title="Outdent ←"><ChevronLeft className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onDemote} disabled={!canDemote} title="Indent →"><ChevronRight className="w-3.5 h-3.5" /></IconBtn>
        </div>
        <div className="flex gap-0.5 mt-0.5">
          <IconBtn onClick={onAddBelow} title="Add block below"><Plus className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={() => setShowMinutes((v: boolean) => !v)} title="Toggle timing"><Clock className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onDelete} title="Delete block" danger><Trash2 className="w-3.5 h-3.5" /></IconBtn>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function IconBtn({ onClick, disabled, title, danger, children }: {
  onClick: () => void; disabled?: boolean; title: string; danger?: boolean; children?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1 rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed ${
        danger ? 'text-red-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}

function EmptyOutline({ outlineId, onAdd }: { outlineId: string; onAdd: (b: OutlineBlock) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
      <p className="text-sm text-slate-400 mb-3">No outline yet</p>
      <button
        onClick={() => onAdd(createLocalBlock(outlineId, null, 'point', 0))}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors"
      >
        <Plus className="w-4 h-4" />Add first point
      </button>
    </div>
  )
}

function SaveIndicator({ state, lastSaved }: { state: SaveState; lastSaved: Date | null }) {
  let text = 'Last saved —'
  let className = 'text-xs text-slate-400'

  if (state === 'saving') {
    text = lastSaved
      ? `Saving… Last saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'Saving…'
  } else if (state === 'error') {
    text = lastSaved
      ? `Save failed. Last saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'Save failed'
    className = 'text-xs text-red-500'
  } else if (lastSaved) {
    text = `Last saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  return <span className={className}>{text}</span>
}

function AIProposalBanner({ blocks, onAccept, onDiscard }: {
  blocks: OutlineBlock[]; onAccept: () => void; onDiscard: () => void
}) {
  const flat = getFlatRenderOrder(blocks)
  return (
    <div className="border border-violet-200 bg-violet-50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-600" />
          <span className="text-sm font-medium text-violet-900">AI-generated outline — review before accepting</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onDiscard} className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors">
            Discard
          </button>
          <button onClick={onAccept} className="px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors">
            Accept
          </button>
        </div>
      </div>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {flat.map((b: OutlineBlock) => (
          <div key={b.id} className="flex items-start gap-2 py-0.5" style={{ paddingLeft: `${b.parent_id ? 16 : 0}px` }}>
            <span className="text-xs text-violet-400 mt-0.5 shrink-0">{BLOCK_TYPE_LABELS[b.type]}</span>
            <span className={`flex-1 ${!b.parent_id ? 'font-semibold text-slate-900' : 'text-sm text-slate-700'}`}>{b.content}</span>
            {b.estimated_minutes && <span className="text-xs text-slate-400">{b.estimated_minutes}m</span>}
          </div>
        ))}
      </div>
    </div>
  )
}


// ── Assistance dropdown ────────────────────────────────────────────────────────
function AssistDropdown({ hasBlocks, aiLoading, onDraftOutline, onOutlineReview, onClose }: {
  hasBlocks:     boolean
  aiLoading:     boolean
  onDraftOutline:  () => void
  onOutlineReview: () => void
  onClose:       () => void
}) {
  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const menu = document.getElementById('assist-menu')
      if (menu && !menu.contains(target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])
  
  return (
    <div id="assist-menu" className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-30 overflow-hidden">
      <div className="p-1.5 space-y-0.5">
        <DropdownItem
          icon={<Sparkles className="w-3.5 h-3.5" />}
          label={hasBlocks ? 'Redraft AI Outline' : 'AI Outline'}
          sublabel="AI builds an outline from your research & notes"
          disabled={aiLoading}
          onClick={onDraftOutline}
        />
        <div className="h-px bg-slate-100 my-1" />
        <DropdownItem
          icon={<BookMarked className="w-3.5 h-3.5" />}
          label="Review Outline"
          sublabel="AI reviews lesson flow, language & structure"
          onClick={onOutlineReview}
          disabled={!hasBlocks}
        />
      </div>
    </div>
  )
}

function DropdownItem({ icon, label, sublabel, onClick, disabled }: {
  icon: React.ReactNode
  label: string
  sublabel: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      <span className="mt-0.5 text-violet-500 shrink-0">{icon}</span>
      <div>
        <p className="text-xs font-semibold text-slate-800">{label}</p>
        <p className="text-[11px] text-slate-400 leading-snug">{sublabel}</p>
      </div>
    </button>
  )
}

// ── Draft Outline Modal — pick which research items to include ─────────────────
export function DraftOutlineModal({ insights, verseNotes, aiLoading, hasBlocks, onGenerate, onViewPrompt, onClose }: {
  insights:    Insights
  verseNotes:  Record<string, import('@/types/database').VerseNote[]>
  aiLoading:   boolean
  hasBlocks:   boolean
  onGenerate:  (selected: { verseRef: string; category: string; title: string; content: string }[]) => void
  onViewPrompt: (selected: { verseRef: string; category: string; title: string; content: string }[]) => void
  onClose:     () => void
}) {
  // Build flat list of all research items
  const allItems = Object.entries(insights).flatMap(([vRef, cats]) =>
    Object.entries(cats).flatMap(([cat, items]) =>
      items.map((item, i) => ({ vRef, cat, item, key: `${vRef}||${cat}||${i}` }))
    )
  )
  const [selected, setSelected] = useState<Set<string>>(new Set(allItems.map(a => a.key)))

  const [showGenerateMenu, setShowGenerateMenu] = useState(false)
const generateMenuRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  if (!showGenerateMenu) return
  function handleClick(e: MouseEvent) {
    if (generateMenuRef.current && !generateMenuRef.current.contains(e.target as Node)) {
      setShowGenerateMenu(false)
    }
  }
  document.addEventListener('mousedown', handleClick)
  return () => document.removeEventListener('mousedown', handleClick)
}, [showGenerateMenu])


  function toggle(key: string) {
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function selectAll()  { setSelected(new Set(allItems.map(a => a.key))) }
  function clearAll()   { setSelected(new Set()) }

  function handleGenerate() {
    const selectedItems = allItems
      .filter(a => selected.has(a.key))
      .map(a => ({ verseRef: a.vRef, category: a.cat, ...a.item }))
    onGenerate(selectedItems)
  }
  
  const CAT_LABEL: Record<string, string> = {
    word_study: 'Word Study', cross_refs: 'Cross-refs', context: 'Context',
    practical: 'Practical', theology_by_tradition: 'Tradition', application: 'Application', quotes: 'Quotes',
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{hasBlocks ? "Redraft AI Outline" : "AI Outline"}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Choose which research to include</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notes summary */}
        <div className="px-6 pt-3 pb-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            All your verse notes are always included automatically
          </div>
        </div>

        {/* Research selection */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {allItems.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No research yet — the outline will be built from your notes alone.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Research Items ({selected.size}/{allItems.length})</p>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-xs text-violet-600 hover:text-violet-800 font-medium">All</button>
                  <span className="text-slate-300">·</span>
                  <button onClick={clearAll} className="text-xs text-slate-400 hover:text-slate-600 font-medium">None</button>
                </div>
              </div>
              {Object.entries(insights).map(([vRef, cats]) => (
                <div key={vRef}>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">{vRef === 'session:shared' ? 'Session Research' : vRef}</p>
                  {Object.entries(cats).map(([cat, items]) =>
                    items.map((item, i) => {
                      const key = `${vRef}||${cat}||${i}`
                      const isSelected = selected.has(key)
                      return (
                        <div key={key} onClick={() => toggle(key)}
                          className={`flex items-start gap-3 p-2.5 mb-1.5 rounded-xl border cursor-pointer transition-all ${
                            isSelected ? 'bg-violet-50 border-violet-200' : 'bg-slate-50 border-transparent hover:border-slate-200'
                          }`}>
                          <span className={`mt-0.5 shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${
                            isSelected ? 'bg-violet-600 border-violet-600' : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mr-2">{CAT_LABEL[cat] ?? cat}</span>
                            {item.title && <span className="text-xs font-semibold text-slate-700 mr-1">{item.title} —</span>}
                            <span className="text-xs text-slate-600">{item.content.slice(0, 80)}{item.content.length > 80 ? '…' : ''}</span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
  <button
    onClick={onClose}
    className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
  >
    Cancel
  </button>

  <div className="relative" ref={generateMenuRef}>
    <button
      type="button"
      onClick={() => setShowGenerateMenu(v => !v)}
      className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
    >
      <Sparkles className="w-3.5 h-3.5" />
      Generate Outline
      <ChevronDown className="w-3.5 h-3.5" />
    </button>

    {showGenerateMenu && (
      <div className="absolute right-0 bottom-full mb-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-[100] overflow-hidden">
        <button
          type="button"
          onClick={() => {
            setShowGenerateMenu(false)
            const selectedItems = allItems
              .filter(a => selected.has(a.key))
              .map(a => ({ verseRef: a.vRef, category: a.cat, ...a.item }))
            onViewPrompt(selectedItems)
          }}
          className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
        >
          View Prompt
        </button>

        <button
          type="button"
          onClick={() => {
            setShowGenerateMenu(false)
            handleGenerate()
          }}
          disabled={aiLoading}
          className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {aiLoading ? 'Drafting…' : 'Send to AI'}
        </button>
      </div>
    )}
  </div>
</div>
      </div>
    </div>
  )
}

// ── Drop zone — shown between blocks when a pending item is active ─────────────
function DropZone({ afterBlockId, onDrop }: {
  afterBlockId: string | null
  onDrop: (afterBlockId: string | null) => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={() => onDrop(afterBlockId)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`w-full h-6 flex items-center justify-center transition-all rounded-lg my-0.5
        ${hovered
          ? 'bg-violet-100 border-2 border-violet-400 border-dashed'
          : 'border-2 border-transparent border-dashed hover:border-violet-300'
        }`}
    >
      {hovered && (
        <span className="text-xs font-semibold text-violet-600">Place here</span>
      )}
    </button>
  )
}
