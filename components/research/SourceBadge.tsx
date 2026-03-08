'use client'

import { Sparkles, BookOpen, User, AlertTriangle } from 'lucide-react'
import { ResearchSourceType, Confidence } from '@/types/database'

interface Props {
  sourceType: ResearchSourceType
  sourceLabel: string
  confidence?: Confidence | null
  compact?: boolean
}

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  high: 'text-emerald-600',
  medium: 'text-amber-600',
  low: 'text-red-500',
}

const SOURCE_ICONS: Record<ResearchSourceType, typeof Sparkles> = {
  ai_synthesis: Sparkles,
  sourced: BookOpen,
  user: User,
}

const SOURCE_COLORS: Record<ResearchSourceType, string> = {
  ai_synthesis: 'bg-violet-50 border-violet-200 text-violet-700',
  sourced: 'bg-blue-50 border-blue-200 text-blue-700',
  user: 'bg-slate-50 border-slate-200 text-slate-600',
}

export function SourceBadge({ sourceType, sourceLabel, confidence, compact = false }: Props) {
  const Icon = SOURCE_ICONS[sourceType]
  const isLowConfidence = confidence === 'low'

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded border ${SOURCE_COLORS[sourceType]}`}
      title={`${sourceLabel}${confidence ? ` · ${confidence} confidence` : ''}`}
    >
      {isLowConfidence ? (
        <AlertTriangle className="w-3 h-3 shrink-0" />
      ) : (
        <Icon className="w-3 h-3 shrink-0" />
      )}
      {!compact && (
        <span className="truncate max-w-[160px]">{sourceLabel}</span>
      )}
      {confidence && !compact && (
        <span className={`font-normal ${CONFIDENCE_COLORS[confidence]}`}>· {confidence}</span>
      )}
    </span>
  )
}
