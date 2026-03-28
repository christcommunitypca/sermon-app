'use client'

import { Sparkles, AlertTriangle } from 'lucide-react'
import { AISource } from '@/types/database'

interface Props {
  aiSource: AISource | null
  aiEdited: boolean
  compact?: boolean
}

export function AISourceBadge({ aiSource, aiEdited, compact = false }: Props) {
  if (!aiSource) return null

  const confidence = aiSource.confidence

  const styles = {
    high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-red-50 text-red-700 border-red-200',
  }

  const baseLabel = (() => {
    switch (aiSource.provenance_label) {
      case 'ai_reworded_notes':
        return 'AI reworded your notes'
      case 'ai_summarized_study':
        return 'AI summarized study material'
      case 'ai_blended_notes_and_study':
        return 'AI blended your notes and study material'
      case 'ai_drafted':
      default:
        return 'AI drafted this'
    }
  })()

  const label = aiEdited ? `${baseLabel} · edited` : baseLabel

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded border ${styles[confidence]}`}
      title={`${label} · ${confidence} confidence · ${aiSource.model} · ${aiSource.prompt_version}`}
    >
      {confidence === 'low' && !compact
        ? <AlertTriangle className="w-3 h-3 shrink-0" />
        : <Sparkles className="w-3 h-3 shrink-0" />
      }
      {!compact && <span>{label}</span>}
    </span>
  )
}
