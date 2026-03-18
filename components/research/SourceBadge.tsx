'use client'

import { Sparkles, BookOpen, User } from 'lucide-react'
import { ResearchSourceType, Confidence } from '@/types/database'

interface Props {
  sourceType: ResearchSourceType
  sourceLabel: string
  confidence?: Confidence | null
}

const SOURCE_ICONS: Record<ResearchSourceType, typeof Sparkles> = {
  ai_synthesis: Sparkles,
  sourced: BookOpen,
  user: User,
}

const CONFIDENCE_DOT: Record<Confidence, string> = {
  high: 'bg-emerald-400',
  medium: 'bg-amber-400',
  low: 'bg-red-400',
}

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'High confidence',
  medium: 'Verify independently',
  low: 'Use with caution',
}

export function SourceBadge({ sourceType, sourceLabel, confidence }: Props) {
  const Icon = SOURCE_ICONS[sourceType]

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-slate-400"
      title={confidence ? `${sourceLabel} · ${CONFIDENCE_LABEL[confidence]}` : sourceLabel}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span className="truncate max-w-[140px]">{sourceLabel}</span>
      {confidence && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${CONFIDENCE_DOT[confidence]}`}
          title={CONFIDENCE_LABEL[confidence]}
        />
      )}
    </span>
  )
}
