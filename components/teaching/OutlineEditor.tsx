'use client'

import { generateOutlineAction } from '@/app/actions/ai'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Plus, Trash2, Clock, Save, Sparkles, RotateCcw, Check, X
} from 'lucide-react'
import { OutlineBlock } from '@/types/database'
import { AISourceBadge } from './AISourceBadge'
import {
  getFlatRenderOrder, getSortedChildren, getDepth,
  moveUp, moveDown, promote, demote,
  createLocalBlock, markAsAIEdited, normalizePositions, totalEstimatedMinutes,
  getDescendantIds
} from '@/lib/outline'
import { saveBlocksAction, createManualSnapshotAction } from '@/app/(app)/[churchSlug]/teaching/[sessionId]/outline-actions'

const BLOCK_TYPE_LABELS: Record<OutlineBlock['type'], string> = {
  point: 'Point',
  sub_point: 'Sub-point',
  scripture: 'Scripture',
  illustration: 'Illustration',
  application: 'Application',
  transition: 'Transition',
}

const BLOCK_TYPE_COLORS: Record<OutlineBlock['type'], string> = {
  point: 'border-l-slate-400',
  sub_point: 'border-l-slate-300',
  scripture: 'border-l-blue-400',
  illustration: 'border-l-amber-400',
  application: 'border-l-emerald-400',
  transition: 'border-l-purple-300',
}

const MAX_DEPTH = 3

interface Props {
  outlineId: string
  sessionId: string
  churchId: string
  churchSlug: string
  initialBlocks: OutlineBlock[]
  flowStructure?: { type: string; label: string }[]
  hasValidAIKey: boolean
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function OutlineEditor({
  outlineId, sessionId, churchId, churchSlug, initialBlocks, flowStructure, hasValidAIKey
}: Props) {
  const [blocks, setBlocks] = useState<OutlineBlock[]>(initialBlocks)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [showSnapshotInput, setShowSnapshotInput] = useState(false)
  const [savingSnapshot, setSavingSnapshot] = useState(false)

  // AI state
  const [aiLoading, setAILoading] = useState(false)
  const [aiProposed, setAIProposed] = useState<OutlineBlock[] | null>(null)
  const [aiError, setAIError] = useState<string | null>(null)

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const flatBlocks = getFlatRenderOrder(blocks)
  const totalMins = totalEstimatedMinutes(blocks)

  // ── Auto-save with debounce ──────────────────────────────────────────────────
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
    const newBlocks = blocks.map(b => {
      if (b.id !== id) return b
      const updated = { ...b, content: value }
      // If AI block is edited, mark as ai_edited
      if (b.ai_source && !b.ai_edited) return { ...updated, ai_edited: true }
      return updated
    })
    update(newBlocks)
  }

  function handleTypeChange(id: string, type: OutlineBlock['type']) {
    update(blocks.map(b => b.id === id ? { ...b, type } : b))
  }

  function handleMinutesChange(id: string, value: string) {
    const mins = value === '' ? null : parseFloat(value)
    update(blocks.map(b => b.id === id ? { ...b, estimated_minutes: isNaN(mins ?? NaN) ? null : mins } : b))
  }

  function handleMoveUp(id: string) { update(moveUp(blocks, id)) }
  function handleMoveDown(id: string) { update(moveDown(blocks, id)) }
  function handlePromote(id: string) { update(promote(blocks, id)) }
  function handleDemote(id: string) { update(demote(blocks, id)) }

  function handleAddBelow(afterId: string) {
    const anchor = blocks.find(b => b.id === afterId)
    if (!anchor) return

    const siblings = getSortedChildren(blocks, anchor.parent_id)
    const anchorIdx = siblings.findIndex(b => b.id === afterId)
    const newPosition = anchor.position + 1

    // Shift siblings after insertion point
    const shifted = blocks.map(b => {
      if (b.parent_id === anchor.parent_id && b.position > anchor.position) {
        return { ...b, position: b.position + 1 }
      }
      return b
    })

    const newBlock = createLocalBlock(outlineId, anchor.parent_id, 'point', newPosition)
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
    update(normalizePositions(blocks.filter(b => !toRemove.has(b.id))))
  }

  // ── Manual snapshot ──────────────────────────────────────────────────────────
  async function handleManualSnapshot() {
    setSavingSnapshot(true)
    const result = await createManualSnapshotAction(
      sessionId, outlineId, churchId, snapshotLabel
    )
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

  function handleDiscardAI() {
    setAIProposed(null)
    setAIError(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {totalMins > 0 && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {totalMins} min est.
            </span>
          )}
          <SaveIndicator state={saveState} lastSaved={lastSaved} />
        </div>

        <div className="flex items-center gap-2">
          {/* Manual snapshot */}
          {showSnapshotInput ? (
            <div className="flex items-center gap-1.5">
              <input
                value={snapshotLabel}
                onChange={e => setSnapshotLabel(e.target.value)}
                placeholder="Version label (optional)"
                className="text-xs px-2 py-1 border border-slate-300 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-slate-400"
                onKeyDown={e => e.key === 'Enter' && handleManualSnapshot()}
                autoFocus
              />
              <button
                onClick={handleManualSnapshot}
                disabled={savingSnapshot}
                className="p-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
                title="Save snapshot"
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
              <Save className="w-3.5 h-3.5" />
              Save version
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
          {aiError}
          <button onClick={() => setAIError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* AI proposal review */}
      {aiProposed && (
        <AIProposalReview
          blocks={aiProposed}
          onAccept={handleAcceptAI}
          onDiscard={handleDiscardAI}
        />
      )}

      {/* Block list */}
      <div className="space-y-1">
        {flatBlocks.length === 0 ? (
          <EmptyOutline outlineId={outlineId} onAdd={(b) => update([b])} />
        ) : (
          flatBlocks.map(block => {
            const depth = getDepth(blocks, block.id)
            const siblings = getSortedChildren(blocks, block.parent_id)
            const idx = siblings.findIndex(b => b.id === block.id)
            const canMoveUp = idx > 0
            const canMoveDown = idx < siblings.length - 1
            const canPromote = !!block.parent_id
            const canDemote = idx > 0 && depth < MAX_DEPTH

            return (
              <BlockRow
                key={block.id}
                block={block}
                depth={depth}
                canMoveUp={canMoveUp}
                canMoveDown={canMoveDown}
                canPromote={canPromote}
                canDemote={canDemote}
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

      {/* Add top-level block */}
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
  )
}

// ── BlockRow ───────────────────────────────────────────────────────────────────
interface BlockRowProps {
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

  const indentPx = depth * 24

  return (
    <div
      className={`group relative flex gap-2 items-start bg-white border border-slate-100 rounded-xl pl-3 pr-2 py-2 border-l-4 ${BLOCK_TYPE_COLORS[block.type]}`}
      style={{ marginLeft: `${indentPx}px` }}
      onFocus={() => setShowControls(true)}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setShowControls(false)
      }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={e => {
        if (!e.currentTarget.contains(document.activeElement)) setShowControls(false)
      }}
    >
      {/* Type selector */}
      <select
        value={block.type}
        onChange={e => onTypeChange(block.id, e.target.value as OutlineBlock['type'])}
        className="shrink-0 text-xs text-slate-400 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer py-1 -ml-1 max-w-[90px]"
        aria-label="Block type"
      >
        {Object.entries(BLOCK_TYPE_LABELS).map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <textarea
          value={block.content}
          onChange={e => onContentChange(block.id, e.target.value)}
          placeholder={`Add ${BLOCK_TYPE_LABELS[block.type].toLowerCase()}…`}
          className="w-full text-sm text-slate-900 bg-transparent border-none focus:outline-none resize-none leading-relaxed placeholder:text-slate-300"
          rows={1}
          onInput={e => {
            const el = e.target as HTMLTextAreaElement
            el.style.height = 'auto'
            el.style.height = `${el.scrollHeight}px`
          }}
        />

        {/* AI badge + minutes row */}
        <div className="flex items-center gap-2 mt-0.5">
          <AISourceBadge aiSource={block.ai_source} aiEdited={block.ai_edited} />
          {showMinutes && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-300" />
              <input
                type="number"
                value={block.estimated_minutes ?? ''}
                onChange={e => onMinutesChange(block.id, e.target.value)}
                placeholder="min"
                min="0"
                max="60"
                step="0.5"
                className="w-12 text-xs text-slate-500 border-none bg-transparent focus:outline-none focus:ring-0"
              />
            </div>
          )}
        </div>
      </div>

      {/* Controls — visible on hover/focus */}
      <div className={`shrink-0 flex flex-col gap-0.5 transition-opacity ${showControls ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {/* Reorder */}
        <div className="flex gap-0.5">
          <IconBtn onClick={onMoveUp} disabled={!canMoveUp} title="Move up (↑)">
            <ChevronUp className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn onClick={onMoveDown} disabled={!canMoveDown} title="Move down (↓)">
            <ChevronDown className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn onClick={onPromote} disabled={!canPromote} title="Promote (←)">
            <ChevronLeft className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn onClick={onDemote} disabled={!canDemote} title="Demote (→)">
            <ChevronRight className="w-3.5 h-3.5" />
          </IconBtn>
        </div>
        {/* Actions */}
        <div className="flex gap-0.5 mt-0.5">
          <IconBtn onClick={onAddBelow} title="Add block below">
            <Plus className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn onClick={() => setShowMinutes(v => !v)} title="Toggle timing">
            <Clock className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn onClick={onDelete} title="Delete block" danger>
            <Trash2 className="w-3.5 h-3.5" />
          </IconBtn>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function IconBtn({ onClick, disabled, title, danger, children }: {
  onClick: () => void
  disabled?: boolean
  title: string
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1 rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed ${
        danger
          ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
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
        <Plus className="w-4 h-4" />
        Add first point
      </button>
    </div>
  )
}

function SaveIndicator({ state, lastSaved }: { state: SaveState; lastSaved: Date | null }) {
  if (state === 'saving') return <span className="text-xs text-slate-400 animate-pulse">Saving…</span>
  if (state === 'saved') return <span className="text-xs text-emerald-600">Saved</span>
  if (state === 'error') return <span className="text-xs text-red-500">Save failed</span>
  if (lastSaved) {
    return <span className="text-xs text-slate-300">Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
  }
  return null
}

function AIProposalReview({
  blocks, onAccept, onDiscard
}: { blocks: OutlineBlock[]; onAccept: () => void; onDiscard: () => void }) {
  const flat = getFlatRenderOrder(blocks)
  return (
    <div className="border border-violet-200 bg-violet-50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-600" />
          <span className="text-sm font-medium text-violet-900">AI-generated outline — review before accepting</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDiscard}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors"
          >
            Discard
          </button>
          <button
            onClick={onAccept}
            className="px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
          >
            Accept outline
          </button>
        </div>
      </div>

      <div className="space-y-1 max-h-80 overflow-y-auto">
        {flat.map((b, i) => {
          const depth = blocks.filter(x => x.id === b.parent_id).length > 0
            ? 1 + flat.filter(x => x.id === b.parent_id).length
            : 0
          return (
            <div
              key={b.id}
              className="flex items-start gap-2 py-1"
              style={{ paddingLeft: `${(b.parent_id ? 16 : 0)}px` }}
            >
              <span className="text-xs text-violet-400 mt-0.5 shrink-0">{BLOCK_TYPE_LABELS[b.type]}</span>
              <span className="text-sm text-slate-800 flex-1">{b.content}</span>
              <AISourceBadge aiSource={b.ai_source} aiEdited={false} compact />
            </div>
          )
        })}
      </div>
    </div>
  )
}