'use client'

import { useState } from 'react'
import { Pin, PinOff, X, ArrowUpRight, Check } from 'lucide-react'
import { ResearchItem as ResearchItemType, BlockType } from '@/types/database'
import { SourceBadge } from './SourceBadge'
import { pinResearchItemAction, dismissResearchItemAction, pushResearchToOutlineAction } from '@/app/(app)/[churchSlug]/teaching/[sessionId]/research-actions'

// Infer appropriate outline block type from research subcategory
function inferBlockType(item: ResearchItemType): BlockType {
  const meta = item.metadata as any
  if (meta?.suggested_block_type) return meta.suggested_block_type as BlockType
  switch (item.subcategory) {
    case 'application': return 'application'
    case 'analogy': return 'illustration'
    case 'cross_ref_common':
    case 'cross_ref_less_common': return 'scripture'
    default: return 'point'
  }
}

interface Props {
  item: ResearchItemType
  sessionId: string
  churchId: string
  churchSlug: string
  onDismiss: (id: string) => void
  onPinToggle: (id: string, isPinned: boolean) => void
}

export function ResearchItem({ item, sessionId, churchId, churchSlug, onDismiss, onPinToggle }: Props) {
  const [pushing, setPushing] = useState(false)
  const [pushed, setPushed] = useState(false)
  const [pinning, setPinning] = useState(false)

  async function handlePush() {
    setPushing(true)
    const blockType = inferBlockType(item)
    const result = await pushResearchToOutlineAction(sessionId, churchId, churchSlug, item.content, blockType)
    setPushing(false)
    if (!result.error) {
      setPushed(true)
      setTimeout(() => setPushed(false), 2500)
    }
  }

  async function handlePin() {
    setPinning(true)
    const newPinned = !item.is_pinned
    await pinResearchItemAction(item.id, newPinned)
    onPinToggle(item.id, newPinned)
    setPinning(false)
  }

  async function handleDismiss() {
    await dismissResearchItemAction(item.id)
    onDismiss(item.id)
  }

  return (
    <div className={`group relative bg-white border rounded-xl p-4 transition-all ${item.is_pinned ? 'border-violet-200 bg-violet-50/30' : 'border-slate-100 hover:border-slate-200'}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <h4 className="text-sm font-semibold text-slate-900 leading-snug flex-1">{item.title}</h4>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handlePin}
            disabled={pinning}
            title={item.is_pinned ? 'Unpin' : 'Pin'}
            className={`p-1 rounded transition-colors ${item.is_pinned ? 'text-violet-600 hover:text-violet-800' : 'text-slate-300 hover:text-slate-600'}`}
          >
            {item.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDismiss}
            title="Dismiss"
            className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-600 leading-relaxed mb-3">{item.content}</p>

      {/* Metadata extras — word study */}
      {item.category === 'word_study' && (item.metadata as any)?.word && (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
            {(item.metadata as any).word}
          </span>
          {(item.metadata as any).original_language && (
            <span className="text-xs text-slate-400 capitalize">{(item.metadata as any).original_language}</span>
          )}
          {(item.metadata as any).strongs_ref && (
            <span className="text-xs text-slate-400">{(item.metadata as any).strongs_ref}</span>
          )}
        </div>
      )}

      {/* Related text reference badge */}
      {item.category === 'related_text' && (item.metadata as any)?.relation_type === 'less_common' && (
        <span className="inline-block text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded mb-2">
          Less common · worth verifying
        </span>
      )}

      <div className="flex items-center justify-between mt-1">
        <SourceBadge
          sourceType={item.source_type}
          sourceLabel={item.source_label}
          confidence={item.confidence}
        />

        <button
          onClick={handlePush}
          disabled={pushing}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
            pushed
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'
          }`}
          title="Add to outline"
        >
          {pushed ? (
            <><Check className="w-3 h-3" />Added</>
          ) : (
            <><ArrowUpRight className="w-3 h-3" />Add to outline</>
          )}
        </button>
      </div>
    </div>
  )
}
