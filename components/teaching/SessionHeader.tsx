'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, Edit, Tag, Clock } from 'lucide-react'

interface Props {
  title:             string
  type:              string
  scriptureRef:      string | null
  scheduledDate:     string | null
  estimatedDuration: number | null
  status:            string
  notes:             string | null
  visibility:        string | null
  createdAt:         string
  isArchived:        boolean
  editHref:          string
  tagsHref:          string
  historyHref:       string
}

export function SessionHeader({
  title, type, scriptureRef, scheduledDate, estimatedDuration,
  status, notes, visibility, createdAt, isArchived, editHref, tagsHref, historyHref,
}: Props) {
  const [expanded, setExpanded] = useState(false)

  const statusColors: Record<string, string> = {
    delivered: 'bg-emerald-100 text-emerald-700',
    published:  'bg-blue-100 text-blue-700',
    archived:   'bg-stone-100 text-stone-500',
    draft:      'bg-slate-100 text-slate-600',
  }

  const dateStr = scheduledDate
    ? new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      })
    : null

  return (
    <div className={`bg-white border rounded-2xl mb-4 ${isArchived ? 'border-stone-200 opacity-80' : 'border-slate-200'}`}>
      {/* ── Always-visible compact row ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded(e => !e)}
          className="p-1 text-slate-300 hover:text-slate-500 transition-colors shrink-0"
          aria-label={expanded ? 'Collapse header' : 'Expand header'}
        >
          {expanded
            ? <ChevronUp   className="w-3.5 h-3.5" />
            : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        <h1 className="flex-1 min-w-0 text-sm font-semibold text-slate-900 truncate">{title}</h1>

        <div className="flex items-center gap-2 shrink-0 text-xs text-slate-400">
          <span className="hidden sm:block">{type.replace(/_/g, ' ')}</span>
          {scriptureRef && <span className="text-slate-500 font-medium">{scriptureRef}</span>}
          {dateStr && <span className="hidden md:block">{dateStr}</span>}
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusColors[status] ?? statusColors.draft}`}>
            {status}
          </span>
        </div>

        {/* Secondary actions — tags and history */}
        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          <Link href={tagsHref}
            className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Tags">
            <Tag className="w-3.5 h-3.5" />
          </Link>
          <Link href={historyHref}
            className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="History">
            <Clock className="w-3.5 h-3.5" />
          </Link>
          {!isArchived && (
            <Link href={editHref}
              className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Edit session details">
              <Edit className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* ── Expanded detail — notes + date + created ──────────────────────── */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-100 space-y-2">
          {/* Session notes if any */}
          {notes && <p className="text-sm text-slate-600 leading-relaxed">{notes}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            {/* Date only shown here if hidden at md breakpoint */}
            {dateStr && <span className="md:hidden">{dateStr}</span>}
            <span>Created {new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
      )}
    </div>
  )
}
