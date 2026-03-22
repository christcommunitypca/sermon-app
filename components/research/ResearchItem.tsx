'use client'

import { useState } from 'react'
import { Pin, PinOff, X, ArrowUpRight, Check } from 'lucide-react'
import { ResearchItem as ResearchItemType, BlockType } from '@/types/database'
import { SourceBadge } from './SourceBadge'
import { pinResearchItemAction, dismissResearchItemAction, pushResearchToOutlineAction } from '@/app/(app)/[churchSlug]/teaching/[sessionId]/research-actions'
import { getPreferredWordStudyPushLabel, parseWordStudyTitle } from '@/lib/word-study'

function inferBlockType(item: ResearchItemType): BlockType {
  const meta = item.metadata as Record<string, unknown>
  if (meta?.suggested_block_type) return meta.suggested_block_type as BlockType
  switch (item.subcategory) {
    case 'application': return 'application'
    case 'analogy': return 'illustration'
    case 'cross_ref_common':
    case 'cross_ref_less_common': return 'scripture'
    default: return 'point'
  }
}


// Determine what content to push to the outline for each category
function getPushContent(item: ResearchItemType): string {
  if (item.category === 'related_text') {
    // Push the scripture reference, not the explanation
    const meta = item.metadata as Record<string, unknown>
   
    return (meta?.ref as string) || item.title || item.content
  }
  if (item.category === 'word_study') {
    return getPreferredWordStudyPushLabel(item.title, (item.metadata as Record<string, unknown> | undefined)?.word as string | undefined)
  }
  if (item.category === 'theological') {
    // Push the title (e.g. "Reformed: unconditional election") as the point label
    return item.title
  }
  return item.content
}

function WordStudyHeading({ title, metadataWord }: { title: string; metadataWord?: string }) {
  const parsed = parseWordStudyTitle(title, metadataWord)
  if (!parsed.original) {
    return <h4 className="text-sm font-semibold text-slate-900 leading-snug flex-1">{parsed.fallbackTitle}</h4>
  }

  return (
    <div className="flex-1 min-w-0">
      <div className="flex flex-wrap items-baseline gap-1.5">
        {parsed.english && <span className="text-sm font-semibold text-slate-900">{parsed.english}</span>}
        {parsed.english && <span className="text-xs text-slate-400">|</span>}
        <span className="text-base font-semibold text-slate-900 font-serif italic">{parsed.original}</span>
        {parsed.transliteration && <span className="text-xs text-slate-500">{parsed.transliteration}</span>}
      </div>
    </div>
  )
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
  const meta = item.metadata as Record<string, unknown>
  
  const rowVerseRef = (meta?.rowVerseRef as string | undefined) ?? 'session:research'
  const rowItemIndex = typeof meta?.rowItemIndex === 'number' ? meta.rowItemIndex : 0
  const sourceResearchId = (meta?.sourceResearchId as string | undefined) ?? item.id

  const [pushing, setPushing] = useState(false)
  const [pushed, setPushed] = useState(false)
  const [pinning, setPinning] = useState(false)
  const [expanded, setExpanded] = useState(false)

  
  const isWordStudy = item.category === 'word_study'
  const isRelatedText = item.category === 'related_text'
  const isTheological = item.category === 'theological'
  const isCrossTradition = isTheological && meta?.is_cross_tradition === true
  const isLessCommon = isRelatedText && meta?.relation_type === 'less_common'

  const isPractical = item.category === 'practical'
  const practicalSubcat = isPractical ? (item.subcategory as string | null) : null

  // Typed extractions — cast once, safe to render directly in JSX
  const metaWord = meta?.word as string | undefined
  const metaLanguage = meta?.original_language as string | undefined
  const metaStrongs = meta?.strongs_ref as string | undefined
  const metaSemanticRange: string[] = Array.isArray(meta?.semantic_range) ? (meta.semantic_range as string[]) : []
  const metaTradition = meta?.tradition as string | undefined
  const metaTestament = meta?.testament as string | undefined
  const metaConnectionType = meta?.connection_type as string | undefined
  const isLong = item.content.length > 280
  
  async function handlePush() {
    setPushing(true)
    const blockType = inferBlockType(item)
    const content = getPushContent(item)
    const result = await pushResearchToOutlineAction({
      sessionId,
      churchId,
      churchSlug,
      content,
      blockType,
      verseRef: rowVerseRef,
      category: item.category,
      itemIndex: rowItemIndex,
      sourceResearchId,
    })
    setPushing(false)
    if (!result.error) {
      setPushed(true)
      setTimeout(() => setPushed(false), 3000)
    }
  }

  async function handlePin() {
    setPinning(true)
    const newPinned = !item.is_pinned
    await pinResearchItemAction({
      sessionId,
      verseRef: rowVerseRef,
      category: item.category,
      itemIndex: rowItemIndex,
      isPinned: newPinned,
      sourceResearchId,
    })
    onPinToggle(item.id, newPinned)
    setPinning(false)
  }

  async function handleDismiss() {
    await dismissResearchItemAction({
      sessionId,
      verseRef: rowVerseRef,
      category: item.category,
      itemIndex: rowItemIndex,
      sourceResearchId,
    })
    onDismiss(item.id)
  }

  return (
    <div className={`group relative bg-white border rounded-xl transition-all ${
      item.is_pinned
        ? 'border-violet-200 bg-violet-50/30'
        : isCrossTradition
        ? 'border-slate-200'
        : 'border-slate-100 hover:border-slate-200'
    }`}>

      {isWordStudy && (metaLanguage || metaStrongs || metaSemanticRange.length > 0) && (
        <div className="px-4 pt-3 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            {metaLanguage && (
              <span className="text-xs text-slate-400 capitalize">{metaLanguage}</span>
            )}
            {metaStrongs && (
              <span className="text-xs font-mono text-slate-400">{metaStrongs}</span>
            )}
            {metaSemanticRange.slice(0, 4).map((facet, i) => (
              <span key={i} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                {facet}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Cross-tradition label strip */}
      {isCrossTradition && (
        <div className="px-4 pt-3 pb-0">
          <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            {metaTradition ? `${metaTradition} perspective` : 'Contrasting view'}
          </span>
        </div>
      )}

      <div className="p-4">
        {/* Practical subcategory badge */}
        {practicalSubcat && (
          <div className="mb-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              practicalSubcat === 'application' ? 'bg-blue-50 text-blue-600' :
              practicalSubcat === 'analogy'      ? 'bg-violet-50 text-violet-600' :
              'bg-slate-100 text-slate-500'
            }`}>
              {practicalSubcat === 'insight' ? 'Insight' :
               practicalSubcat === 'analogy' ? 'Analogy' : 'Application'}
            </span>
          </div>
        )}
        <div className="flex items-start justify-between gap-3 mb-2">
          {isWordStudy ? <WordStudyHeading title={item.title} metadataWord={metaWord} /> : <h4 className="text-sm font-semibold text-slate-900 leading-snug flex-1">{item.title}</h4>}
          {/* Actions: always visible on mobile, hover-reveal on desktop */}
          <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button
              onClick={handlePin}
              disabled={pinning}
              title={item.is_pinned ? 'Unpin' : 'Pin'}
              className={`p-1.5 rounded transition-colors ${item.is_pinned ? 'text-violet-600 hover:text-violet-800' : 'text-slate-300 hover:text-slate-600'}`}
            >
              {item.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleDismiss}
              title="Dismiss"
              className="p-1.5 text-slate-300 hover:text-red-500 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content — expandable if long */}
        <div className="mb-3">
          <p className={`text-sm text-slate-600 leading-relaxed ${!expanded && isLong ? 'line-clamp-3' : ''}`}>
            {item.content}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-slate-400 hover:text-slate-600 mt-1 transition-colors"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>

        {/* Related text: connection context */}
        {isRelatedText && (metaConnectionType || isLessCommon || metaTestament) && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {metaConnectionType && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded capitalize">
                {metaConnectionType}
              </span>
            )}
            {isLessCommon && (
              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded">
                Less common · verify before using
              </span>
            )}
            {metaTestament && !metaConnectionType && (
              <span className="text-xs text-slate-400 capitalize">{metaTestament} Testament</span>
            )}
          </div>
        )}

        {/* Footer: source + action */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <SourceBadge
            sourceType={item.source_type}
            sourceLabel={item.source_label}
            confidence={item.confidence}
          />

          <button
            onClick={handlePush}
            disabled={pushing}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors min-h-[32px] ${
              pushed
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
            title={isRelatedText ? 'Add scripture reference to outline' : 'Add to outline'}
          >
            {pushed ? (
              <><Check className="w-3 h-3" />Added to outline</>
            ) : pushing ? (
              <span className="text-slate-400">Adding…</span>
            ) : (
              <><ArrowUpRight className="w-3 h-3" />{isRelatedText ? 'Add ref' : 'Add to outline'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
