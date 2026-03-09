'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BookOpen, Plus, ExternalLink, ChevronDown, ChevronUp, Flame } from 'lucide-react'
import type { SeriesSession, SeriesSessionStatus } from '@/types/database'

// Static — no need to pass as prop
const STATUS_STYLES: Record<SeriesSessionStatus, string> = {
  planned:   'bg-slate-100 text-slate-500',
  created:   'bg-blue-100 text-blue-700',
  delivered: 'bg-emerald-100 text-emerald-700',
}

interface Props {
  ss: SeriesSession
  linkedSession: { title: string } | null
  weekDate: string | null
  churchSlug: string
  createWeekSession: (id: string) => Promise<void>
}

export function SeriesWeekExpander({
  ss, linkedSession, weekDate, churchSlug, createWeekSession
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const hasNotes = !!(ss.notes || ss.liturgical_note)

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${
      ss.liturgical_note ? 'border-amber-200' : 'border-slate-100'
    }`}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Week number badge */}
        <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center shrink-0">
          {ss.week_number}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-900 truncate">
              {linkedSession?.title ?? ss.proposed_title ?? `Week ${ss.week_number}`}
            </span>
            <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[ss.status]}`}>
              {ss.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
            {ss.proposed_scripture && (
              <span className="flex items-center gap-1">
                <BookOpen className="w-3 h-3" />{ss.proposed_scripture}
              </span>
            )}
            {weekDate && <span>{weekDate}</span>}
            {ss.liturgical_note && (
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                <Flame className="w-3 h-3" />Liturgical note
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1.5">
          {/* Expand/collapse if there's extra content */}
          {hasNotes && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="p-1.5 text-slate-300 hover:text-slate-600 rounded transition-colors"
              title={expanded ? 'Collapse' : 'Show notes'}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}

          {ss.status === 'planned' && (
            <form action={createWeekSession.bind(null, ss.id)}>
              <button type="submit"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors">
                <Plus className="w-3 h-3" />Create
              </button>
            </form>
          )}

          {ss.session_id && (
            <Link href={`/${churchSlug}/teaching/${ss.session_id}`}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors">
              <ExternalLink className="w-3 h-3" />Open
            </Link>
          )}
        </div>
      </div>

      {/* Expandable notes panel */}
      {expanded && hasNotes && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-2.5 bg-slate-50/50">
          {ss.liturgical_note && (
            <div className="flex items-start gap-2">
              <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-700 mb-0.5">Liturgical note</p>
                <p className="text-xs text-amber-800 leading-relaxed">{ss.liturgical_note}</p>
              </div>
            </div>
          )}
          {ss.notes && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-0.5">Preparation notes</p>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{ss.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
