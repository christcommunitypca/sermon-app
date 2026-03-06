import { AISource } from '@/types/outline'
import { AlertTriangle } from 'lucide-react'

interface Props {
  source: AISource
  edited: boolean
  hidden?: boolean
}

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-red-50 text-red-700 border-red-200',
}

export function AISourceBadge({ source, edited, hidden }: Props) {
  if (hidden) return null

  const style = CONFIDENCE_STYLES[source.confidence] ?? CONFIDENCE_STYLES.medium
  const label = edited ? 'AI-assisted' : 'AI-generated'
  const version = source.prompt_version.replace('outline.', 'v')

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${style} shrink-0`}
    >
      {source.confidence === 'low' && !edited && (
        <AlertTriangle className="w-2.5 h-2.5" />
      )}
      {source.confidence === 'low' && !edited
        ? `${label} · Verify before use · ${source.model} · ${version}`
        : `${label} · ${source.model} · ${version}`
      }
    </span>
  )
}
