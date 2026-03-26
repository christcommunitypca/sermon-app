'use client'
// ── components/series/SeriesWeekList.tsx ──────────────────────────────────────
// Interactive week list for the series detail page.
// Features:
//   • + button between rows to insert a new lesson (with form)
//   • Delete button on unlinked planned weeks
//   • Verse conflict badge when two lessons share overlapping scripture refs

import { useState, useTransition } from 'react'
import {
  Plus, Trash2, AlertCircle, Loader2, Check, X, BookOpen, ChevronDown,
} from 'lucide-react'
import type { SeriesSession } from '@/types/database'
import {
  insertLessonAfterWeekAction,
  deleteSeriesWeekAction,
} from './SeriesExtraActions'
import { SeriesWeekExpander } from './SeriesWeekExpander'

// ── Verse conflict detection ──────────────────────────────────────────────────
// Parses "Book Chapter:Verse-Verse" style refs into {book, chapter, verseStart, verseEnd}
// Returns true if two refs overlap in any verse

interface ParsedRef { book: string; chapter: number; verseStart: number; verseEnd: number }

function parseRef(ref: string): ParsedRef | null {
  // Normalize: "Mark 11:1-10", "John 3:16", "Rom 5:1-11", "Gen 1"
  const m = ref.trim().match(/^(.+?)\s+(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?$/)
  if (!m) return null
  return {
    book:       m[1].toLowerCase().replace(/\s+/g, ''),
    chapter:    parseInt(m[2], 10),
    verseStart: m[3] ? parseInt(m[3], 10) : 1,
    verseEnd:   m[4] ? parseInt(m[4], 10) : (m[3] ? parseInt(m[3], 10) : 999),
  }
}

function refsOverlap(a: string, b: string): boolean {
  const pa = parseRef(a)
  const pb = parseRef(b)
  if (!pa || !pb) return false
  if (pa.book !== pb.book) return false
  if (pa.chapter !== pb.chapter) return false
  return pa.verseStart <= pb.verseEnd && pb.verseStart <= pa.verseEnd
}

function computeConflicts(sessions: SeriesSession[]): Set<string> {
  const conflicted = new Set<string>()
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i].proposed_scripture
      const b = sessions[j].proposed_scripture
      if (a && b && refsOverlap(a, b)) {
        conflicted.add(sessions[i].id)
        conflicted.add(sessions[j].id)
      }
    }
  }
  return conflicted
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionRow = SeriesSession & {
  teaching_sessions?: { title: string; status: string; scheduled_date: string | null } | null
}

interface Props {
  sessions:    SessionRow[]
  seriesId:    string
  churchSlug:  string
  startDate:   string | null
  createWeekSession: (id: string) => Promise<void>
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SeriesWeekList({ sessions, seriesId, churchSlug, startDate, createWeekSession }: Props) {
  const [insertingAfter, setInsertingAfter] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const activeSessions = sessions.filter(ss => (ss.teaching_sessions?.status ?? '') !== 'archived')
  const archivedSessions = sessions.filter(ss => (ss.teaching_sessions?.status ?? '') === 'archived')
  const verseConflicts = computeConflicts(activeSessions)

  function computeWeekDate(weekNumber: number): string | null {
    if (!startDate) return null
    const d = new Date(startDate + 'T00:00:00')
    d.setDate(d.getDate() + (weekNumber - 1) * 7)
    return d.toISOString().split('T')[0]
  }

  async function handleDelete(ss: SessionRow) {
    if (ss.session_id) return
    setDeletingId(ss.id)
    startTransition(async () => {
      await deleteSeriesWeekAction(ss.id, seriesId, churchSlug)
      setDeletingId(null)
    })
  }

  function renderRows(list: SessionRow[], archived = false) {
    return list.map((ss, idx) => {
      const weekDateStr = computeWeekDate(ss.week_number)
      const weekDateLabel = weekDateStr
        ? new Date(weekDateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : null
      const linkedSession = ss.teaching_sessions ?? null
      const sessionScheduledDate = linkedSession?.scheduled_date ?? null
      const hasDateConflict = !!(!archived && weekDateStr && sessionScheduledDate && sessionScheduledDate !== weekDateStr)
      const hasVerseConflict = !archived && verseConflicts.has(ss.id)
      const canDelete = ss.week_type !== 'normal' || (!ss.session_id && ss.status === 'planned')

      return (
        <div key={ss.id}>
          {!archived && idx === 0 && (
            <InsertButton
              weekNumber={0}
              insertingAfter={insertingAfter}
              onInsert={() => setInsertingAfter(0)}
              onClose={() => setInsertingAfter(null)}
              insertedDate={computeWeekDate(1)}
              newWeekNumber={1}
              seriesId={seriesId}
              churchSlug={churchSlug}
            />
          )}

          <div className={`relative group/row ${archived ? 'opacity-80' : ''}`}>
            <SeriesWeekExpander
              ss={ss}
              linkedSession={linkedSession}
              weekDate={weekDateLabel}
              weekDateIso={weekDateStr}
              hasConflict={hasDateConflict}
              conflictDate={hasDateConflict ? sessionScheduledDate : null}
              churchSlug={churchSlug}
              seriesId={seriesId}
              createWeekSession={createWeekSession}
              extraBadge={hasVerseConflict ? (
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                  <AlertCircle className="w-2.5 h-2.5" />Verse conflict
                </span>
              ) : archived ? (
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">Archived</span>
              ) : null}
              onDelete={!archived && canDelete ? () => handleDelete(ss) : null}
              isDeleting={deletingId === ss.id}
            />
          </div>

          {!archived && (
            <InsertButton
              weekNumber={ss.week_number}
              insertingAfter={insertingAfter}
              onInsert={() => setInsertingAfter(ss.week_number)}
              onClose={() => setInsertingAfter(null)}
              insertedDate={computeWeekDate(ss.week_number + 1)}
              newWeekNumber={ss.week_number + 1}
              seriesId={seriesId}
              churchSlug={churchSlug}
            />
          )}
        </div>
      )
    })
  }

  return (
    <div className="space-y-0">
      {renderRows(activeSessions)}
      {archivedSessions.length > 0 && (
        <details className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-stone-700">Archived lessons ({archivedSessions.length})</summary>
          <div className="mt-3 space-y-2">{renderRows(archivedSessions, true)}</div>
        </details>
      )}
      {sessions.length === 0 && (
        <p className="text-center py-10 text-slate-400 text-sm">No weeks planned yet.</p>
      )}
    </div>
  )
}

// ── InsertButton + inline form ────────────────────────────────────────────────

function InsertButton({
  weekNumber, insertingAfter, onInsert, onClose,
  insertedDate, newWeekNumber, seriesId, churchSlug,
}: {
  weekNumber:    number
  insertingAfter: number | null
  onInsert:      () => void
  onClose:       () => void
  insertedDate:  string | null
  newWeekNumber: number
  seriesId:      string
  churchSlug:    string
}) {
  const isOpen = insertingAfter === weekNumber
  const [isPending, startTransition] = useTransition()
  const [title,     setTitle]     = useState('')
  const [scripture, setScripture] = useState('')
  const [notes,     setNotes]     = useState('')
  const [type,      setType]      = useState('sermon')
  const [error,     setError]     = useState<string | null>(null)

  const dateLabel = insertedDate
    ? new Date(insertedDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : null

  function handleSave() {
    if (!title.trim()) { setError('Title is required.'); return }
    setError(null)
    startTransition(async () => {
      const result = await insertLessonAfterWeekAction(
        seriesId, weekNumber, churchSlug,
        { title: title.trim(), scripture: scripture.trim(), type, notes: notes.trim() }
      )
      if (result.error) { setError(result.error); return }
      setTitle(''); setScripture(''); setNotes(''); setType('sermon')
      onClose()
    })
  }

  return (
    <div className="relative flex items-center py-0.5 group/insert">
      {/* Hairline divider */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-slate-100 group-hover/insert:bg-slate-200 transition-colors" />

      {/* + button */}
      {!isOpen && (
        <button
          onClick={onInsert}
          className="relative z-10 mx-auto flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded-full text-[11px] font-medium text-slate-400
            opacity-0 group-hover/insert:opacity-100 hover:text-violet-600 hover:border-violet-300 hover:bg-violet-50 transition-all"
        >
          <Plus className="w-3 h-3" />Add lesson here
        </button>
      )}

      {/* Inline form */}
      {isOpen && (
        <div className="relative z-10 w-full bg-white border border-violet-200 rounded-xl shadow-sm p-4 my-1">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold text-slate-700">Insert lesson — Week {newWeekNumber}</p>
              {dateLabel && (
                <p className="text-[11px] text-slate-400 mt-0.5">{dateLabel}</p>
              )}
            </div>
            <button onClick={onClose} className="p-1 text-slate-300 hover:text-slate-600 rounded transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Fields */}
          <div className="space-y-2">
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Sermon title *"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 placeholder:text-slate-300"
            />
            <div className="flex gap-2">
              <input
                value={scripture}
                onChange={e => setScripture(e.target.value)}
                placeholder="Scripture ref (e.g. Mark 11:1-10)"
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 placeholder:text-slate-300"
              />
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-36 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 text-slate-700"
              >
                <option value="sermon">Sermon</option>
                <option value="sunday_school">Sunday School</option>
                <option value="bible_study">Bible Study</option>
              </select>
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 placeholder:text-slate-300 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 mt-3">
            <button onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isPending || !title.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              {isPending
                ? <><Loader2 className="w-3 h-3 animate-spin" />Inserting…</>
                : <><Check className="w-3 h-3" />Insert lesson</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}