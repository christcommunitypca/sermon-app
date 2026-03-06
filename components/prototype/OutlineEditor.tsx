'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import {
  Block,
  BlockType,
  ReorderModel,
  getSortedChildren,
  normalizePositions,
  moveUp,
  moveDown,
  promote,
  demote,
  addBlockAfter,
  deleteBlock,
  updateBlock,
} from '@/types/outline'

import { AISourceBadge } from './AISourceBadge'
import { BlockTypeSelector } from './BlockTypeSelector'
import { DeliveryView } from './DeliveryView'

import {
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Trash2, Plus, GripVertical, Sparkles, Presentation,
} from 'lucide-react'

// ── Seed data ─────────────────────────────────────────────────────────────────

const SEED_BLOCKS: Block[] = normalizePositions([
  { id: 'p1', parent_id: null,  type: 'point',        content: "God's Provision in the Wilderness",                                             position: 0, ai_source: null, ai_edited: false },
  { id: 'p1a', parent_id: 'p1', type: 'sub_point',    content: 'The manna was daily, not stockpiled (Exodus 16:4)',                              position: 0, ai_source: null, ai_edited: false },
  { id: 'p1b', parent_id: 'p1', type: 'sub_point',    content: 'The people\'s instinct was to hoard — and it failed',                           position: 1, ai_source: null, ai_edited: false },
  { id: 'p1c', parent_id: 'p1', type: 'scripture',    content: 'Exodus 16:14–20',                                                               position: 2, ai_source: null, ai_edited: false },
  { id: 'p2', parent_id: null,  type: 'point',        content: 'Jesus Reframes the Wilderness',                                                 position: 1, ai_source: null, ai_edited: false },
  { id: 'p2a', parent_id: 'p2', type: 'sub_point',    content: 'He quotes Deuteronomy 8:3 directly — man does not live on bread alone',         position: 0, ai_source: null, ai_edited: false },
  { id: 'p2b', parent_id: 'p2', type: 'scripture',    content: 'Matthew 4:1–4',                                                                 position: 1, ai_source: null, ai_edited: false },
  { id: 'p2c', parent_id: 'p2', type: 'illustration', content: 'The difference between a vending machine god and a Father',                     position: 2, ai_source: null, ai_edited: false },
  { id: 'p3', parent_id: null,  type: 'point',        content: 'What Daily Dependence Looks Like Now',                                          position: 2, ai_source: null, ai_edited: false },
  { id: 'p3a', parent_id: 'p3', type: 'application',  content: 'The Lord\'s Prayer is not poetry — it is a daily posture',                      position: 0, ai_source: null, ai_edited: false },
  { id: 'p3b', parent_id: 'p3', type: 'sub_point',    content: 'What breaks our pattern of dependence (busyness, self-sufficiency)',            position: 1, ai_source: null, ai_edited: false },
])

const AI_MOCK_BLOCKS: Omit<Block, 'id' | 'position'>[] = [
  {
    parent_id: null,
    type: 'illustration',
    content: 'Augustine\'s restless heart — connects ancient longing to wilderness narrative',
    ai_source: { model: 'gpt-4o', prompt_version: 'outline.v1', confidence: 'high' },
    ai_edited: false,
  },
  {
    parent_id: null,
    type: 'application',
    content: 'Invite congregation to identify one area where they are stockpiling rather than trusting',
    ai_source: { model: 'gpt-4o', prompt_version: 'outline.v1', confidence: 'medium' },
    ai_edited: false,
  },
  {
    parent_id: null,
    type: 'sub_point',
    content: 'The Israelites forgot the wilderness provision within one generation (Judges 2:10)',
    ai_source: { model: 'gpt-4o', prompt_version: 'outline.v1', confidence: 'low' },
    ai_edited: false,
  },
]

// ── Block type visual config ───────────────────────────────────────────────────

const BLOCK_CONFIG: Record<BlockType, { label: string; color: string; bg: string; border: string; indent: boolean }> = {
  point:        { label: 'Point',        color: 'text-slate-900',   bg: 'bg-white',       border: 'border-slate-200', indent: false },
  sub_point:    { label: 'Sub-point',    color: 'text-slate-700',   bg: 'bg-white',       border: 'border-slate-100', indent: true },
  scripture:    { label: 'Scripture',    color: 'text-indigo-800',  bg: 'bg-indigo-50',   border: 'border-indigo-100', indent: true },
  illustration: { label: 'Illustration', color: 'text-amber-800',   bg: 'bg-amber-50',    border: 'border-amber-100',  indent: true },
  application:  { label: 'Application',  color: 'text-emerald-800', bg: 'bg-emerald-50',  border: 'border-emerald-100', indent: true },
  transition:   { label: 'Transition',   color: 'text-slate-400',   bg: 'bg-white',       border: 'border-slate-100', indent: false },
}

// ── Model B: Block row with up/down/promote/demote ────────────────────────────

interface ModelBBlockProps {
  block: Block
  blocks: Block[]
  selectedId: string | null
  onSelect: (id: string) => void
  onUpdate: (id: string, updates: Partial<Block>) => void
  onDelete: (id: string) => void
  onAdd: (afterId: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onPromote: (id: string) => void
  onDemote: (id: string) => void
  dragHandleProps?: Record<string, unknown>
  showLargeHandles?: boolean
  suppressChildren?: boolean
}

function BlockRow({
  block, blocks, selectedId, onSelect, onUpdate, onDelete, onAdd,
  onMoveUp, onMoveDown, onPromote, onDemote,
  dragHandleProps, showLargeHandles, suppressChildren,
}: ModelBBlockProps) {
  const cfg = BLOCK_CONFIG[block.type]
  const siblings = getSortedChildren(blocks, block.parent_id)
  const idx = siblings.findIndex(b => b.id === block.id)
  const isFirst = idx === 0
  const isLast = idx === siblings.length - 1
  const isRoot = block.parent_id === null
  const isSelected = selectedId === block.id
  const children = getSortedChildren(blocks, block.id)
  const isPoint = block.type === 'point'

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    const wasAI = !!block.ai_source && !block.ai_edited
    onUpdate(block.id, {
      content: newContent,
      ai_edited: wasAI ? true : block.ai_edited,
    })
  }

  // Auto-resize textarea
  const taRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto'
      taRef.current.style.height = taRef.current.scrollHeight + 'px'
    }
  }, [block.content])

  return (
    <div className={cfg.indent ? 'ml-7' : ''}>
      <div
        className={`relative group flex items-start gap-2 rounded-lg border px-3 py-2.5 mb-1 cursor-pointer transition-all ${cfg.bg} ${cfg.border} ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''} ${isPoint ? 'shadow-sm' : ''}`}
        onClick={() => onSelect(block.id)}
      >
        {/* Drag handle (shown in Model A/C or showLargeHandles) */}
        {dragHandleProps && (
          <button
            {...(dragHandleProps as Record<string, unknown>)}
            className={`flex items-center text-slate-300 hover:text-slate-500 transition-colors shrink-0 touch-none ${showLargeHandles ? 'mt-0 p-1' : 'mt-1'}`}
            aria-label="Drag to reorder"
          >
            <GripVertical className={showLargeHandles ? 'w-6 h-6' : 'w-4 h-4'} />
          </button>
        )}

        {/* Main content area */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5 flex-wrap mb-1">
            <BlockTypeSelector value={block.type} onChange={type => onUpdate(block.id, { type })} compact />
            {block.ai_source && (
              <AISourceBadge source={block.ai_source} edited={block.ai_edited} />
            )}
          </div>
          <textarea
            ref={taRef}
            value={block.content}
            onChange={handleContentChange}
            placeholder="Enter content..."
            rows={1}
            className={`w-full resize-none bg-transparent border-none outline-none text-sm leading-relaxed ${cfg.color} placeholder-slate-300 ${block.type === 'scripture' ? 'italic' : ''}`}
            style={{ overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          />
          {block.estimated_minutes != null && (
            <div className="text-xs text-slate-400 mt-1">~{block.estimated_minutes} min</div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-0.5 shrink-0 ml-1">
          {/* Move Up/Down — always visible (Model B mobile-first) */}
          <button onClick={e => { e.stopPropagation(); onMoveUp(block.id) }} disabled={isFirst}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-20 disabled:cursor-default transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center text-slate-400 hover:text-slate-700"
            aria-label="Move up">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); onMoveDown(block.id) }} disabled={isLast}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-20 disabled:cursor-default transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center text-slate-400 hover:text-slate-700"
            aria-label="Move down">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {/* Promote/Demote */}
          <button onClick={e => { e.stopPropagation(); onDemote(block.id) }} disabled={isFirst}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-20 disabled:cursor-default transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center text-slate-400 hover:text-slate-700"
            title="Demote (nest under previous block)"
            aria-label="Demote">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); onPromote(block.id) }} disabled={isRoot}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-20 disabled:cursor-default transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center text-slate-400 hover:text-slate-700"
            title="Promote (un-nest)"
            aria-label="Promote">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          {/* Add / Delete */}
          <button onClick={e => { e.stopPropagation(); onAdd(block.id) }}
            className="p-1 rounded hover:bg-slate-100 transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center text-slate-400 hover:text-emerald-600"
            aria-label="Add block below">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(block.id) }}
            className="p-1 rounded hover:bg-red-50 transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center text-slate-300 hover:text-red-500"
            aria-label="Delete block">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Children */}
      {!suppressChildren && children.map(child => (
        <BlockRow
          key={child.id}
          block={child}
          blocks={blocks}
          selectedId={selectedId}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAdd={onAdd}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onPromote={onPromote}
          onDemote={onDemote}
          dragHandleProps={dragHandleProps !== undefined ? undefined : undefined}
          showLargeHandles={showLargeHandles}
        />
      ))}
    </div>
  )
}

// ── Model A: Sortable wrapper ──────────────────────────────────────────────────

function SortableBlockRow({ block, ...rest }: { block: Block } & Omit<ModelBBlockProps, 'dragHandleProps'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  const children = getSortedChildren(rest.blocks, block.id)

  return (
    <div ref={setNodeRef} style={style} className={BLOCK_CONFIG[block.type].indent ? 'ml-7' : ''}>
      <BlockRow {...rest} block={{ ...block, parent_id: block.parent_id }} dragHandleProps={{ ...attributes, ...listeners }} suppressChildren />
      {children.length > 0 && (
        <div className="ml-7">
          <SortableContext items={children.map(b => b.id)} strategy={verticalListSortingStrategy}>
            {children.map(child => (
              <SortableBlockRow key={child.id} block={child} {...rest} />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  )
}

// ── Model D: Tap-to-select, tap-to-place ──────────────────────────────────────

function ModelDBlock({
  block, blocks, pickedId, onPick, onPlace,
  onUpdate, onDelete, onAdd,
}: {
  block: Block
  blocks: Block[]
  pickedId: string | null
  onPick: (id: string) => void
  onPlace: (targetId: string) => void
  onUpdate: (id: string, updates: Partial<Block>) => void
  onDelete: (id: string) => void
  onAdd: (afterId: string) => void
}) {
  const cfg = BLOCK_CONFIG[block.type]
  const isPicked = pickedId === block.id
  const isTarget = pickedId && pickedId !== block.id
  const children = getSortedChildren(blocks, block.id)

  return (
    <div className={cfg.indent ? 'ml-7' : ''}>
      <div
        className={`relative rounded-lg border px-3 py-2.5 mb-1 transition-all cursor-pointer ${cfg.bg} ${cfg.border}
          ${isPicked ? 'ring-2 ring-blue-500 scale-[0.98]' : ''}
          ${isTarget ? 'ring-2 ring-dashed ring-blue-300 hover:ring-blue-500' : ''}
        `}
        onClick={() => {
          if (pickedId) {
            if (pickedId !== block.id) onPlace(block.id)
          } else {
            onPick(block.id)
          }
        }}
      >
        {isTarget && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-blue-50/60 text-xs font-medium text-blue-600 pointer-events-none">
            Move here
          </div>
        )}
        <div className={`flex items-start gap-1.5 flex-wrap mb-1 ${isTarget ? 'opacity-30' : ''}`}>
          <BlockTypeSelector value={block.type} onChange={type => onUpdate(block.id, { type })} compact />
          {block.ai_source && <AISourceBadge source={block.ai_source} edited={block.ai_edited} />}
        </div>
        <div className={`text-sm leading-relaxed ${cfg.color} ${isTarget ? 'opacity-30' : ''}`}>
          {block.content || <span className="text-slate-300 italic">Empty block</span>}
        </div>
        {!pickedId && (
          <div className="flex gap-1 mt-2">
            <button onClick={e => { e.stopPropagation(); onAdd(block.id) }}
              className="p-1 text-slate-400 hover:text-emerald-600 min-h-[28px] min-w-[28px] flex items-center justify-center"
              aria-label="Add block below">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(block.id) }}
              className="p-1 text-slate-300 hover:text-red-500 min-h-[28px] min-w-[28px] flex items-center justify-center"
              aria-label="Delete">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      {children.map(child => (
        <ModelDBlock key={child.id} block={child} blocks={blocks}
          pickedId={pickedId} onPick={onPick} onPlace={onPlace}
          onUpdate={onUpdate} onDelete={onDelete} onAdd={onAdd} />
      ))}
    </div>
  )
}

// ── Main OutlineEditor ─────────────────────────────────────────────────────────

export function OutlineEditor() {
  const [blocks, setBlocks] = useState<Block[]>(SEED_BLOCKS)
  const [model, setModel] = useState<ReorderModel>('B')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reorderMode, setReorderMode] = useState(false) // Model C
  const [pickedId, setPickedId] = useState<string | null>(null) // Model D
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [delivering, setDelivering] = useState(false)
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  useEffect(() => {
    setIsTouchDevice(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  // ── Handlers ────────────────────────────────────────────────────────

  const update = useCallback((id: string, updates: Partial<Block>) => {
    setBlocks(prev => updateBlock(prev, id, updates))
  }, [])

  const handleDelete = useCallback((id: string) => {
    setBlocks(prev => deleteBlock(prev, id))
    setSelectedId(null)
  }, [])

  const handleAdd = useCallback((afterId: string) => {
    setBlocks(prev => {
      const after = prev.find(b => b.id === afterId)
      const newBlock: Block = {
        id: crypto.randomUUID(),
        parent_id: after?.parent_id ?? null,
        type: 'sub_point',
        content: '',
        position: (after?.position ?? 0) + 0.5,
        ai_source: null,
        ai_edited: false,
      }
      const updated = normalizePositions([...prev, newBlock])
      setSelectedId(newBlock.id)
      return updated
    })
  }, [])

  const handleMoveUp   = useCallback((id: string) => setBlocks(prev => moveUp(prev, id)), [])
  const handleMoveDown = useCallback((id: string) => setBlocks(prev => moveDown(prev, id)), [])
  const handlePromote  = useCallback((id: string) => setBlocks(prev => promote(prev, id)), [])
  const handleDemote   = useCallback((id: string) => setBlocks(prev => demote(prev, id)), [])

  const handleInsertAI = () => {
    const afterBlock = selectedId ? blocks.find(b => b.id === selectedId) : null
    const rootBlocks = getSortedChildren(blocks, null)
    const insertAfterPosition = afterBlock
      ? (afterBlock.parent_id === null ? afterBlock.position : rootBlocks[rootBlocks.length - 1]?.position ?? -1)
      : (rootBlocks[rootBlocks.length - 1]?.position ?? -1)

    const newBlocks: Block[] = AI_MOCK_BLOCKS.map((b, i) => ({
      ...b,
      id: crypto.randomUUID(),
      parent_id: null,
      position: insertAfterPosition + 0.1 * (i + 1),
    }))
    setBlocks(prev => normalizePositions([...prev, ...newBlocks]))
  }

  // ── Model D: tap to place ───────────────────────────────────────────

  const handlePlace = useCallback((targetId: string) => {
    if (!pickedId) return
    setBlocks(prev => {
      const picked = prev.find(b => b.id === pickedId)!
      const target = prev.find(b => b.id === targetId)!
      if (picked.parent_id !== target.parent_id) return prev // only same-level for simplicity
      const siblings = getSortedChildren(prev, picked.parent_id)
      const oldIdx = siblings.findIndex(b => b.id === pickedId)
      const newIdx = siblings.findIndex(b => b.id === targetId)
      const reordered = arrayMove(siblings, oldIdx, newIdx)
      const nonSiblings = prev.filter(b => b.parent_id !== picked.parent_id)
      return [...nonSiblings, ...reordered.map((b, i) => ({ ...b, position: i }))]
    })
    setPickedId(null)
  }, [pickedId])

  // ── Model A: DnD ─────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeBlock = blocks.find(b => b.id === active.id)
    const overBlock = blocks.find(b => b.id === over.id)
    if (!activeBlock || !overBlock) return
    // Within-level only for Model A; cross-level allowed in Model C
    if (model === 'A' && activeBlock.parent_id !== overBlock.parent_id) return
    const siblings = getSortedChildren(blocks, activeBlock.parent_id)
    const oldIdx = siblings.findIndex(b => b.id === active.id)
    const newIdx = siblings.findIndex(b => b.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(siblings, oldIdx, newIdx)
    setBlocks(prev => {
      const nonSiblings = prev.filter(b => b.parent_id !== activeBlock.parent_id)
      return [...nonSiblings, ...reordered.map((b, i) => ({ ...b, position: i }))]
    })
  }

  const rootBlocks = getSortedChildren(blocks, null)
  const activeDragBlock = activeDragId ? blocks.find(b => b.id === activeDragId) : null

  const sharedBlockProps = {
    blocks,
    selectedId,
    onSelect: setSelectedId,
    onUpdate: update,
    onDelete: handleDelete,
    onAdd: handleAdd,
    onMoveUp: handleMoveUp,
    onMoveDown: handleMoveDown,
    onPromote: handlePromote,
    onDemote: handleDemote,
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <>
      {delivering && (
        <DeliveryView blocks={blocks} onExit={() => setDelivering(false)} />
      )}

      <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 sticky top-0 z-40">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-400 font-sans mb-0.5">Prototype · Outline Editor</p>
                <h1 className="text-lg font-semibold text-slate-900" style={{ fontFamily: 'inherit' }}>
                  Daily Bread — Wilderness &amp; Dependence
                </h1>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleInsertAI}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 text-sm font-medium font-sans transition-colors border border-violet-200"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="hidden sm:inline">Insert AI Blocks</span>
                </button>
                <button
                  onClick={() => setDelivering(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium font-sans transition-colors"
                >
                  <Presentation className="w-4 h-4" />
                  <span className="hidden sm:inline">Deliver</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Reorder model toggle */}
        <div className="bg-white border-b border-slate-100 px-4 sm:px-6 py-2.5">
          <div className="max-w-3xl mx-auto flex items-center gap-3 flex-wrap">
            <span className="text-xs text-slate-400 font-sans uppercase tracking-wider">Reorder Mode:</span>
            {(['A', 'B', 'C', 'D'] as ReorderModel[]).map(m => (
              <button
                key={m}
                onClick={() => { setModel(m); setReorderMode(false); setPickedId(null) }}
                className={`px-3 py-1 rounded-full text-xs font-semibold font-sans transition-colors border ${
                  model === m
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                }`}
              >
                {m}
                <span className="ml-1 font-normal opacity-60 hidden sm:inline">
                  {m === 'A' ? '· Drag' : m === 'B' ? '· Move ↑↓' : m === 'C' ? '· Mode Switch' : '· Tap-to-Place'}
                </span>
              </button>
            ))}
            {model === 'C' && (
              <div className="ml-auto flex gap-1">
                <button
                  onClick={() => setReorderMode(false)}
                  className={`px-3 py-1 rounded text-xs font-sans font-medium transition-colors ${!reorderMode ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  Edit
                </button>
                <button
                  onClick={() => setReorderMode(true)}
                  className={`px-3 py-1 rounded text-xs font-sans font-medium transition-colors ${reorderMode ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  Reorder
                </button>
              </div>
            )}
            {model === 'D' && pickedId && (
              <button
                onClick={() => setPickedId(null)}
                className="ml-auto px-3 py-1 rounded-full text-xs font-sans font-medium bg-red-50 text-red-600 border border-red-200"
              >
                Cancel move
              </button>
            )}
          </div>
        </div>

        {/* Editor */}
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">

          {/* Model A: DnD */}
          {model === 'A' && (
            <DndContext sensors={sensors} collisionDetection={closestCenter}
              onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <SortableContext items={rootBlocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                {rootBlocks.map(block => (
                  <SortableBlockRow key={block.id} block={block} {...sharedBlockProps} />
                ))}
              </SortableContext>
              <DragOverlay>
                {activeDragBlock && (
                  <div className={`rounded-lg border px-3 py-2 shadow-xl opacity-90 ${BLOCK_CONFIG[activeDragBlock.type].bg} ${BLOCK_CONFIG[activeDragBlock.type].border}`}>
                    <span className={`text-sm ${BLOCK_CONFIG[activeDragBlock.type].color}`}>{activeDragBlock.content}</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}

          {/* Model B: Move up/down (default, mobile-first) */}
          {model === 'B' && rootBlocks.map(block => (
            <BlockRow key={block.id} block={block} {...sharedBlockProps} />
          ))}

          {/* Model C: Explicit reorder mode with drag */}
          {model === 'C' && (
            <DndContext sensors={sensors} collisionDetection={closestCenter}
              onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className={reorderMode ? 'overflow-hidden' : ''} style={reorderMode ? { touchAction: 'none' } : {}}>
                <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                  {rootBlocks.map(block => (
                    <SortableBlockRow key={block.id} block={block} {...sharedBlockProps} showLargeHandles={reorderMode} />
                  ))}
                </SortableContext>
              </div>
              <DragOverlay>
                {activeDragBlock && (
                  <div className={`rounded-lg border px-3 py-2 shadow-xl ${BLOCK_CONFIG[activeDragBlock.type].bg} ${BLOCK_CONFIG[activeDragBlock.type].border}`}>
                    <span className={`text-sm ${BLOCK_CONFIG[activeDragBlock.type].color}`}>{activeDragBlock.content}</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}

          {/* Model D: Tap to select, tap to place */}
          {model === 'D' && (
            <>
              {pickedId && (
                <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 font-sans font-medium">
                  Block selected — tap another block to move it there, or tap Cancel above.
                </div>
              )}
              {rootBlocks.map(block => (
                <ModelDBlock key={block.id} block={block} blocks={blocks}
                  pickedId={pickedId} onPick={setPickedId} onPlace={handlePlace}
                  onUpdate={update} onDelete={handleDelete} onAdd={handleAdd} />
              ))}
            </>
          )}
        </main>

        {/* Evaluation section */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-8 mt-8 border-t border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-1 font-sans">Evaluation Notes</h2>
          <p className="text-sm text-slate-500 mb-6 font-sans">Test each model on a real iPhone, then answer these questions:</p>
          <div className="space-y-5 font-sans">
            {[
              {
                q: '1. Model A — Drag and Drop',
                d: 'Rate the iPhone Safari experience: Fluid / Acceptable / Frustrating. Note any scroll conflict during long-press activation, lag in drag preview, or cross-level dragging issues.',
              },
              {
                q: '2. Model B — Move Up/Down',
                d: 'Is one-handed ↑↓ and ←→ operation comfortable for a 6–10 block outline? Answer: Yes / Mostly / No. Note any tap-target sizing issues.',
              },
              {
                q: '3. Model C — Explicit Reorder Mode',
                d: 'Does switching to Reorder Mode feel like acceptable friction or annoying overhead? Would you use this at a pulpit?',
              },
              {
                q: '4. Model D — Tap to Select, Tap to Place',
                d: 'Does the two-tap mental model feel natural or awkward? Is the "selected" state visually clear enough on a phone?',
              },
              {
                q: '5. Delivery Mode',
                d: 'Open Deliver and test on iPhone in portrait and landscape. Is the font, spacing, and layout usable at a pulpit? Any clipping, safe-area issues, or overflow?',
              },
              {
                q: '6. Recommendation',
                d: 'Which model should ship for mobile touch devices? Which for desktop/pointer devices? Write your answer here before building the real editor.',
              },
            ].map(({ q, d }) => (
              <div key={q} className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-slate-800 mb-1">{q}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{d}</p>
                <div className="mt-3 border border-dashed border-slate-200 rounded-lg px-3 py-2 min-h-[44px] text-sm text-slate-300 italic">
                  Your answer...
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
