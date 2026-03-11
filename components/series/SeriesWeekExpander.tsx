'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  BookOpen, Plus, ExternalLink, ChevronDown, Flame, User,
  Ban, RotateCcw, Check, Loader2, AlertCircle, ChevronRight,
} from 'lucide-react'
import type { SeriesSession } from '@/types/database'
import {
  skipWeekAction,
  setGuestPreacherAction,
  restoreWeekAction,
  updateSkippedWeekAction,
  insertGapAfterWeekAction,
} from '@/app/(app)/[churchSlug]/series/actions'

// ── Badge styles per week type ─────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  planned:   'bg-slate-100 text-slate-500',
  created:   'bg-blue-100 text-blue-700',
  delivered: 'bg-emerald-100 text-emerald-700',
}

type PanelMode = null | 'skip' | 'guest'

interface Props {
  ss:                SeriesSession
  linkedSession:     { title: string } | null
  weekDate:          string | null
  churchSlug:        string
  seriesId:          string
  createWeekSession: (id: string) => Promise<void>
}

export function SeriesWeekExpander({
  ss, linkedSession, weekDate, churchSlug, seriesId, createWeekSession,
}: Props) {
  const [panel,        setPanel]        = useState<PanelMode>(null)
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState<string | null>(null)

  // Skip fields
  const [skipReason,   setSkipReason]   = useState(ss.skip_reason ?? '')
  const [pushWeeks,    setPushWeeks]    = useState(false)

  // Guest fields
  const [guestName,    setGuestName]    = useState(ss.guest_name ?? '')
  const [guestInSeries,setGuestInSeries]= useState(ss.guest_in_series ?? false)

  // Skipped week editable fields
  const [editTitle,    setEditTitle]    = useState(ss.proposed_title ?? '')
  const [editScripture,setEditScripture]= useState(ss.proposed_scripture ?? '')

  // Options dropdown
  const [optionsOpen,  setOptionsOpen]  = useState(false)
  const optionsRef                      = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setOptionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isSkipped = ss.week_type === 'skipped'
  const isGuest   = ss.week_type === 'guest'
  const isNormal  = ss.week_type === 'normal'

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleSkip() {
    setSaving(true); setSaveError(null)
    const result = await skipWeekAction(ss.id, seriesId, churchSlug, skipReason || null)
    if (result.error) { setSaveError(result.error); setSaving(false); return }
    // If pushWeeks, insert a gap so subsequent weeks shift out by one
    if (pushWeeks) {
      const gapResult = await insertGapAfterWeekAction(seriesId, ss.week_number, churchSlug)
      if (gapResult.error) { setSaveError(gapResult.error); setSaving(false); return }
    }
    setSaving(false)
    setPanel(null)
  }

  async function handleGuest() {
    if (!guestName.trim()) { setSaveError('Enter the guest preacher\'s name.'); return }
    setSaving(true); setSaveError(null)
    const result = await setGuestPreacherAction(ss.id, seriesId, churchSlug, guestName, guestInSeries)
    setSaving(false)
    if (result.error) { setSaveError(result.error); return }
    setPanel(null)
  }

  async function handleRestore() {
    setSaving(true); setSaveError(null)
    const result = await restoreWeekAction(ss.id, seriesId, churchSlug)
    setSaving(false)
    if (result.error) setSaveError(result.error)
  }

  async function handleSkippedWeekSave() {
    setSaving(true); setSaveError(null)
    const result = await updateSkippedWeekAction(ss.id, seriesId, churchSlug, {
      proposed_title:    editTitle    || undefined,
      proposed_scripture:editScripture || undefined,
    })
    setSaving(false)
    if (result.error) setSaveError(result.error)
  }

  // ── Derived display ───────────────────────────────────────────────────────────

  const rowBorder = isSkipped ? 'border-slate-200 bg-slate-50/50 opacity-80'
    : isGuest   ? 'border-blue-100 bg-blue-50/30'
    : ss.liturgical_note ? 'border-amber-200'
    : 'border-slate-100'

  const displayTitle = isGuest
    ? `Guest: ${ss.guest_name ?? 'Unknown'}`
    : linkedSession?.title ?? ss.proposed_title ?? `Week ${ss.week_number}`

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${rowBorder}`}>

      {/* ── Main row ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3">

        {/* Week number badge */}
        <div className={`w-7 h-7 rounded-md text-xs font-bold flex items-center justify-center shrink-0 ${
          isSkipped ? 'bg-slate-200 text-slate-400'
          : isGuest ? 'bg-blue-100 text-blue-500'
          : 'bg-slate-100 text-slate-500'
        }`}>
          {isSkipped ? <Ban className="w-3.5 h-3.5" /> : isGuest ? <User className="w-3.5 h-3.5" /> : ss.week_number}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium truncate ${isSkipped ? 'text-slate-400 italic' : 'text-slate-900'}`}>
              {isSkipped ? (ss.proposed_title || 'Skipped') : displayTitle}
            </span>

            {/* Status badge — only for normal weeks */}
            {isNormal && (
              <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[ss.status]}`}>
                {ss.status}
              </span>
            )}

            {/* Skipped badge */}
            {isSkipped && (
              <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-400 border border-slate-200">
                Skipped
              </span>
            )}

            {/* Guest badge */}
            {isGuest && (
              <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-600">
                {ss.guest_in_series ? 'Guest · in series' : 'Guest · standalone'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
            {ss.proposed_scripture && !isSkipped && (
              <span className="flex items-center gap-1">
                <BookOpen className="w-3 h-3" />{ss.proposed_scripture}
              </span>
            )}
            {weekDate && <span>{weekDate}</span>}

            {/* Liturgical note — hover tooltip */}
            {ss.liturgical_note && (
              <span className="relative group cursor-default">
                <span className="flex items-center gap-1 text-amber-600 font-medium">
                  <Flame className="w-3 h-3" />Liturgical note
                </span>
                {/* Tooltip */}
                <span className="absolute bottom-full left-0 mb-1.5 z-30 w-64 px-3 py-2 bg-amber-950 text-amber-100 text-xs rounded-xl shadow-lg
                  opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 leading-relaxed">
                  {ss.liturgical_note}
                  <span className="absolute top-full left-4 border-4 border-transparent border-t-amber-950" />
                </span>
              </span>
            )}

            {/* Skip reason (inline, not a tooltip) */}
            {isSkipped && ss.skip_reason && (
              <span className="text-slate-400 italic">{ss.skip_reason}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1.5">

          {/* Open link (created sessions) */}
          {ss.session_id && isNormal && (
            <Link href={`/${churchSlug}/teaching/${ss.session_id}`}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <ExternalLink className="w-3 h-3" />Open
            </Link>
          )}

          {/* Create button — normal planned weeks only */}
          {ss.status === 'planned' && isNormal && (
            <form action={createWeekSession.bind(null, ss.id)}>
              <button type="submit"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors">
                <Plus className="w-3 h-3" />Create
              </button>
            </form>
          )}

          {/* Restore button for skipped/guest */}
          {(isSkipped || isGuest) && (
            <button onClick={handleRestore} disabled={saving}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              <RotateCcw className="w-3 h-3" />Restore
            </button>
          )}

          {/* Options ▾ dropdown */}
          <div className="relative" ref={optionsRef}>
            <button
              onClick={() => { setOptionsOpen(o => !o); setPanel(null) }}
              className="flex items-center gap-0.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Options<ChevronDown className="w-3 h-3 ml-0.5" />
            </button>

            {optionsOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-sm">
                <button
                  onClick={() => { setPanel('skip'); setOptionsOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Ban className="w-3.5 h-3.5 text-slate-400" />Skip this week
                </button>
                <button
                  onClick={() => { setPanel('guest'); setOptionsOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <User className="w-3.5 h-3.5 text-slate-400" />Guest preacher
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Skipped week: editable title/scripture ───────────────────────────── */}
      {isSkipped && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/60 space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Skipped week — optional details
          </p>
          <div className="flex gap-2">
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              placeholder="Sermon title (optional)"
              className="flex-1 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder:text-slate-300"
            />
            <input
              value={editScripture}
              onChange={e => setEditScripture(e.target.value)}
              placeholder="Scripture ref"
              className="w-32 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder:text-slate-300"
            />
            <button onClick={handleSkippedWeekSave} disabled={saving}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* ── Skip panel ────────────────────────────────────────────────────────── */}
      {panel === 'skip' && (
        <ActionPanel
          title="Skip this week"
          icon={<Ban className="w-4 h-4 text-slate-500" />}
          onCancel={() => { setPanel(null); setSaveError(null) }}
          onConfirm={handleSkip}
          confirmLabel="Skip week"
          confirmClass="bg-slate-800 hover:bg-slate-900 text-white"
          saving={saving}
          error={saveError}
        >
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Reason <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            value={skipReason}
            onChange={e => setSkipReason(e.target.value)}
            placeholder="e.g. Guest preacher, church retreat, holiday…"
            className="w-full text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder:text-slate-300"
          />
          <label className="flex items-center gap-2 mt-3 cursor-pointer group">
            <input type="checkbox" checked={pushWeeks} onChange={e => setPushWeeks(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-slate-700 cursor-pointer" />
            <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">
              Push all subsequent weeks out one week
            </span>
          </label>
          <p className="text-xs text-slate-400 mt-1 ml-6">
            This inserts a gap week and renumbers the rest of the series
          </p>
        </ActionPanel>
      )}

      {/* ── Guest panel ───────────────────────────────────────────────────────── */}
      {panel === 'guest' && (
        <ActionPanel
          title="Guest preacher"
          icon={<User className="w-4 h-4 text-blue-500" />}
          onCancel={() => { setPanel(null); setSaveError(null) }}
          onConfirm={handleGuest}
          confirmLabel="Save"
          confirmClass="bg-blue-600 hover:bg-blue-700 text-white"
          saving={saving}
          error={saveError}
        >
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Name</label>
          <input
            value={guestName}
            onChange={e => setGuestName(e.target.value)}
            placeholder="Guest preacher's name"
            className="w-full text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder:text-slate-300"
            autoFocus
          />
          <div className="mt-3 space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input type="radio" name={`guest-type-${ss.id}`} checked={guestInSeries}
                onChange={() => setGuestInSeries(true)}
                className="mt-0.5 w-4 h-4 cursor-pointer" />
              <div>
                <span className="text-sm font-medium text-slate-700 block">In series</span>
                <span className="text-xs text-slate-400">Guest preaches the next passage in your series. Counts as a series week.</span>
              </div>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input type="radio" name={`guest-type-${ss.id}`} checked={!guestInSeries}
                onChange={() => setGuestInSeries(false)}
                className="mt-0.5 w-4 h-4 cursor-pointer" />
              <div>
                <span className="text-sm font-medium text-slate-700 block">Standalone</span>
                <span className="text-xs text-slate-400">Guest preaches their own message. Series pauses this week, resumes next.</span>
              </div>
            </label>
          </div>
        </ActionPanel>
      )}
    </div>
  )
}

// ── Reusable action panel ──────────────────────────────────────────────────────

function ActionPanel({
  title, icon, children, onCancel, onConfirm,
  confirmLabel, confirmClass, saving, error,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  confirmClass: string
  saving: boolean
  error: string | null
}) {
  return (
    <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/50">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-sm font-semibold text-slate-700">{title}</span>
      </div>
      {children}
      {error && (
        <div className="flex items-center gap-2 mt-2 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}
      <div className="flex items-center gap-2 mt-3 justify-end">
        <button onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
          Cancel
        </button>
        <button onClick={onConfirm} disabled={saving}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-40 transition-colors ${confirmClass}`}>
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}