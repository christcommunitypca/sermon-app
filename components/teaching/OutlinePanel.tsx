'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Plus, Trash2, Clock, Save, Sparkles, RotateCcw, Check, X,
  BookMarked, AlertCircle
} from 'lucide-react'
import { OutlineBlock, VerseNote } from '@/types/database'
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

const MAX_DEPTH = 3

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type Insights = Record<string, Record<string, { title: string; content: string }[]>>

interface Props {
  outlineId: string
  sessionId: string
  churchId: string
  churchSlug: string
  initialBlocks: OutlineBlock[]
  flowStructure?: { type: string; label: string }[]
  hasValidAIKey: boolean
  estimatedDuration: number | null
  initialInsights: Insights
  initialVerseNotes: Record<string, VerseNote[]>
}

export function OutlinePanel({
  outlineId, sessionId, churchId, churchSlug,
  initialBlocks, flowStructure, hasValidAIKey,
  estimatedDuration, initialInsights, initialVerseNotes,
}: Props) {
  const [blocks, setBlocks] = useState<OutlineBlock[]>(initialBlocks)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [showSnapshotInput, setShowSnapshotInput] = useState(false)
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [showSummary, setShowSummary] = useState(false)

  // AI state
  const [aiLoading, setAILoading] = useState(false)
  const [aiProposed, setAIProposed] = useState<OutlineBlock[] | null>(null)
  const [aiError, setAIError] = useState<string | null>(null)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flatBlocks = getFlatRenderOrder(blocks)
  const totalMins = totalEstimatedMinutes(blocks)
  const targetMins = estimatedDuration ?? 0
  const overTarget = targetMins > 0 && totalMins > targetMins
  const underTarget = targetMins > 0 && totalMins < targetMins * 0.85
  const pct = targetMins > 0 ? Math.min((totalMins / targetMins) * 100, 100) : 0

  // ── Auto-save ────────────────────────────────────────────────────────────────
  const scheduleSave = useCallback((newBlocks: OutlineBlock[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveState('saving')
    saveTimerRef.current = setTimeout(async () => {
      const result = await saveBlocksAction(outlineId, sessionId, churchId, newBlocks)
      if (result.error) {
        setSaveState('error')
      } else {
        setSaveState('saved')
        setLastSaved(new Date())
        setTimeout(() => setSaveState('idle'), 2000)
      }
    }, 800)
  }, [outlineId, sessionId, churchId])

  function update(newBlocks: OutlineBlock[]) {
    setBlocks(newBlocks)
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
  function handlePromote(id: string) { update(promote(blocks, id)) }
  function handleDemote(id: string) { update(demote(blocks, id)) }

  function handleAddBelow(afterId: string) {
    const anchor = blocks.find((b: OutlineBlock) => b.id === afterId)
    if (!anchor) return
    const shifted = blocks.map((b: OutlineBlock) => {
      if (b.parent_id === anchor.parent_id && b.position > anchor.position)
        return { ...b, position: b.position + 1 }
      return b
    })
    const newBlock = createLocalBlock(outlineId, anchor.parent_id, 'point', anchor.position + 1)
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

  // Add block from reference panel
  function handleAddFromReference(block: OutlineBlock) {
    const topLevel = getSortedChildren(blocks, null) as OutlineBlock[]
    const positioned = { ...block, position: topLevel.length }
    update(normalizePositions([...blocks, positioned]))
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

  // ── AI generation ────────────────────────────────────────────────────────────
  async function handleGenerateAI() {
    setAILoading(true)
    setAIError(null)
    try {
      const data = await generateOutlineAction({ sessionId, churchId, flowStructure })
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

  return (
    <div className="flex gap-5 min-h-[600px]">
      {/* ── Left: Outline editor ─────────────────────────────────────────── */}
      <div className="w-[56%] flex flex-col gap-3">
        {/* Time bar */}
        {targetMins > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
            <div className="flex items-center justify-between mb-2 text-xs">
              <span className={`font-semibold ${overTarget ? 'text-red-600' : underTarget ? 'text-amber-600' : 'text-slate-600'}`}>
                {totalMins} min{' '}
                {overTarget && <span className="font-normal text-red-500">({totalMins - targetMins} over target)</span>}
                {underTarget && <span className="font-normal text-amber-500">({targetMins - totalMins} under target)</span>}
              </span>
              <span className="text-slate-400">Target: {targetMins} min</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${overTarget ? 'bg-red-400' : underTarget ? 'bg-amber-400' : 'bg-emerald-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {totalMins > 0 && targetMins === 0 && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />{totalMins} min est.
              </span>
            )}
            <SaveIndicator state={saveState} lastSaved={lastSaved} />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Lesson summary */}
            <button
              onClick={() => setShowSummary(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <BookMarked className="w-3.5 h-3.5" />
              Lesson Summary
            </button>

            {/* Snapshot */}
            {showSnapshotInput ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={snapshotLabel}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSnapshotLabel(e.target.value)}
                  placeholder="Version label (optional)"
                  className="text-xs px-2 py-1 border border-slate-300 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleManualSnapshot()}
                  autoFocus
                />
                <button
                  onClick={handleManualSnapshot}
                  disabled={savingSnapshot}
                  className="p-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowSnapshotInput(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSnapshotInput(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />Save version
              </button>
            )}

            {/* AI generate */}
            {hasValidAIKey && (
              <button
                onClick={handleGenerateAI}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {aiLoading ? 'Generating…' : 'Generate outline'}
              </button>
            )}
          </div>
        </div>

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

        {/* Block list */}
        <div className="space-y-1">
          {flatBlocks.length === 0 ? (
            <EmptyOutline outlineId={outlineId} onAdd={b => update([b])} />
          ) : (
            flatBlocks.map(block => {
              const depth = getDepth(blocks, block.id)
              const siblings = getSortedChildren(blocks, block.parent_id) as OutlineBlock[]
              const idx = siblings.findIndex(b => b.id === block.id)
              return (
                <BlockRow
                  key={block.id}
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
                />
              )
            })
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
      <div className="flex-1 overflow-y-auto">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Reference</p>
        <OutlineReference
          outlineId={outlineId}
          insights={initialInsights}
          verseNotes={initialVerseNotes}
          onAddToOutline={handleAddFromReference}
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
    </div>
  )
}

// ── BlockRow ───────────────────────────────────────────────────────────────────

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
}

function BlockRow({
  block, depth, canMoveUp, canMoveDown, canPromote, canDemote,
  onContentChange, onTypeChange, onMinutesChange,
  onMoveUp, onMoveDown, onPromote, onDemote, onAddBelow, onAddSubPoint, onDelete
}: BlockRowProps) {
  const [showControls, setShowControls] = useState(false)
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
      `}
      style={{ marginLeft: `${depth * 24}px` }}
      onFocus={() => setShowControls(true)}
      onBlur={(e: React.FocusEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setShowControls(false) }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(document.activeElement)) setShowControls(false) }}
    >
      {/* Type selector */}
      <select
        value={block.type}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onTypeChange(block.id, e.target.value as OutlineBlock['type'])}
        className="shrink-0 text-xs text-slate-400 bg-transparent border-none focus:outline-none cursor-pointer py-1 -ml-1 max-w-[90px]"
      >
        {Object.entries(BLOCK_TYPE_LABELS).map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <textarea
          ref={textareaRef}
          value={block.content}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onContentChange(block.id, e.target.value)}
          placeholder={`Add ${BLOCK_TYPE_LABELS[block.type].toLowerCase()}…`}
          className={`w-full bg-transparent border-none focus:outline-none resize-none leading-relaxed placeholder:text-slate-300
            ${isSection
              ? 'text-lg font-bold text-slate-900'
              : 'text-sm text-slate-800'
            }
          `}
          rows={1}
          onInput={(e: React.FormEvent<HTMLTextAreaElement>) => {
            const el = e.target as HTMLTextAreaElement
            el.style.height = 'auto'
            el.style.height = `${el.scrollHeight}px`
          }}
        />
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
      <div className={`shrink-0 flex flex-col gap-0.5 transition-opacity ${showControls ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <div className="flex gap-0.5">
          <IconBtn onClick={onMoveUp} disabled={!canMoveUp} title="Move up"><ChevronUp className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onMoveDown} disabled={!canMoveDown} title="Move down"><ChevronDown className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onPromote} disabled={!canPromote} title="Promote"><ChevronLeft className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onDemote} disabled={!canDemote} title="Demote"><ChevronRight className="w-3.5 h-3.5" /></IconBtn>
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
  if (state === 'saving') return <span className="text-xs text-slate-400 animate-pulse">Saving…</span>
  if (state === 'saved') return <span className="text-xs text-emerald-600">Saved</span>
  if (state === 'error') return <span className="text-xs text-red-500">Save failed</span>
  if (lastSaved) return <span className="text-xs text-slate-300">Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
  return null
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