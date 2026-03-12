'use client'

import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Calendar, RotateCcw, Check, Loader2, AlertCircle, Info } from 'lucide-react'
import {
  createCalendarEventAction,
  updateCalendarEventAction,
  deleteCalendarEventAction,
} from '@/app/actions/calendar'
import { computeRecurringDate, toISODate } from '@/lib/calendar/dates'
import type { CalendarEventWithImpacts, ImpactType, ServiceImpact } from '@/app/actions/calendar'
import { formatEventDate } from '@/lib/calendar/dates'

const IMPACT_LABELS: Record<ImpactType, { label: string; desc: string; color: string }> = {
  informational: { label: 'Informational',  desc: 'Shows on timeline, series continues',     color: 'text-slate-600 bg-slate-100' },
  skip:          { label: 'Skip week',       desc: 'Series pauses, shifts out one week',       color: 'text-amber-700 bg-amber-100' },
  replace:       { label: 'Replace',         desc: 'This event takes the series slot',         color: 'text-violet-700 bg-violet-100' },
}

const BUILT_IN_NAMES: Record<string, string> = {
  easter:             'Easter Sunday',
  palm_sunday:        'Palm Sunday',
  advent_start:       'Advent Sunday',
  christmas:          'Christmas',
  reformation_sunday: 'Reformation Sunday',
}

interface BuiltInDate {
  key: string
  name: string
  dateStr: string
  isConfigured: boolean
}

interface Props {
  churchId:     string
  churchSlug:   string
  events:       CalendarEventWithImpacts[]
  builtInDates: BuiltInDate[]
  serviceTypes: { key: string; label: string }[]
  currentYear:  number
}

export function CalendarSettings({
  churchId, churchSlug, events, builtInDates, serviceTypes, currentYear,
}: Props) {
  const [localEvents, setLocalEvents]   = useState(events)
  const [showAddForm, setShowAddForm]   = useState(false)
  const [expanded, setExpanded]         = useState<Set<string>>(new Set())
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // New event form state
  const [newName,       setNewName]       = useState('')
  const [newType,       setNewType]       = useState<'recurring' | 'one_time'>('one_time')
  const [newDate,       setNewDate]       = useState('')
  const [newRecKey,     setNewRecKey]     = useState('')
  const [newDesc,       setNewDesc]       = useState('')
  const [newImpacts,    setNewImpacts]    = useState<Record<string, ImpactType>>({})

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function buildImpacts(impactMap: Record<string, ImpactType>): ServiceImpact[] {
    return serviceTypes.map(st => ({
      service_type: st.key,
      impact: impactMap[st.key] ?? 'informational',
    }))
  }

  // ── Add built-in recurring event ─────────────────────────────────────────────
  async function handleAddBuiltIn(key: string, name: string) {
    setSaving(true); setError(null)
    const result = await createCalendarEventAction(churchId, churchSlug, {
      name,
      event_type: 'recurring',
      recurrence_key: key,
      impacts: buildImpacts({}),   // all informational by default
    })
    setSaving(false)
    if (result.error) { setError(result.error); return }
    // Refresh — server action revalidates the path, but we need to reflect locally
    window.location.reload()
  }

  // ── Add custom event ──────────────────────────────────────────────────────────
  async function handleAddCustom() {
    if (!newName.trim()) { setError('Event name is required.'); return }
    if (newType === 'one_time' && !newDate) { setError('Date is required for one-time events.'); return }
    if (newType === 'recurring' && !newRecKey) { setError('Select a recurrence type.'); return }

    setSaving(true); setError(null)
    const result = await createCalendarEventAction(churchId, churchSlug, {
      name: newName,
      description: newDesc || undefined,
      event_type: newType,
      recurrence_key: newType === 'recurring' ? newRecKey : undefined,
      event_date: newType === 'one_time' ? newDate : undefined,
      impacts: buildImpacts(newImpacts),
    })
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setShowAddForm(false)
    setNewName(''); setNewDate(''); setNewDesc(''); setNewImpacts({})
    window.location.reload()
  }

  // ── Update impact for an existing event ──────────────────────────────────────
  async function handleUpdateImpact(
    eventId: string,
    impacts: { service_type: string; impact: ImpactType }[]
  ) {
    setSaving(true); setError(null)
    const result = await updateCalendarEventAction(eventId, churchSlug, { impacts })
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setLocalEvents(prev => prev.map(e =>
      e.id === eventId
        ? { ...e, calendar_service_impacts: impacts.map(i => ({ ...i, id: '', notes: null })) }
        : e
    ))
  }

  // ── Delete event ──────────────────────────────────────────────────────────────
  async function handleDelete(eventId: string) {
    setSaving(true); setError(null)
    const result = await deleteCalendarEventAction(eventId, churchSlug)
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setLocalEvents(prev => prev.filter(e => e.id !== eventId))
    setDeleteConfirm(null)
  }

  // ── Compute display date for an event ─────────────────────────────────────────
  function getEventDisplayDate(event: CalendarEventWithImpacts): string {
    if (event.event_type === 'one_time' && event.event_date) {
      return formatEventDate(event.event_date)
    }
    if (event.recurrence_key) {
      // Show next occurrence
      const thisYearDate = computeRecurringDate(event.recurrence_key, currentYear)
      const today = new Date()
      const targetYear = thisYearDate && thisYearDate < today ? currentYear + 1 : currentYear
      const d = computeRecurringDate(event.recurrence_key, targetYear)
      if (d) return `Next: ${formatEventDate(toISODate(d))}`
    }
    return 'Recurring'
  }

  // Group configured built-in keys for the "add built-ins" section
  const configuredKeys = new Set(localEvents.map(e => e.recurrence_key).filter(Boolean))
  const unaddedBuiltIns = Array.from(new Set(builtInDates.map(d => d.key)))
    .filter(k => !configuredKeys.has(k))

  return (
    <div className="space-y-6">

      {/* ── Recurring dates section ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Recurring Dates</h2>
          <span className="text-xs text-slate-400">Auto-computed each year</span>
        </div>

        {/* Configured recurring events */}
        {localEvents.filter(e => e.event_type === 'recurring').map(event => (
          <EventCard
            key={event.id}
            event={event}
            displayDate={getEventDisplayDate(event)}
            serviceTypes={serviceTypes}
            expanded={expanded.has(event.id)}
            onToggle={() => toggleExpand(event.id)}
            onUpdateImpact={impacts => handleUpdateImpact(event.id, impacts)}
            onDelete={() => setDeleteConfirm(event.id)}
            onConfirmDelete={() => handleDelete(event.id)}
            deleteConfirm={deleteConfirm === event.id}
            onDeleteCancel={() => setDeleteConfirm(null)}
            saving={saving}
          />
        ))}

        {/* Quick-add unadded built-ins */}
        {unaddedBuiltIns.length > 0 && (
          <div className="mt-3 p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
            <p className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              These standard dates aren't configured yet. Click to add with default settings.
            </p>
            <div className="flex flex-wrap gap-2">
              {unaddedBuiltIns.map(key => (
                <button
                  key={key}
                  onClick={() => handleAddBuiltIn(key, BUILT_IN_NAMES[key] ?? key)}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-slate-400 hover:text-slate-900 disabled:opacity-40 transition-all"
                >
                  <Plus className="w-3 h-3" />
                  {BUILT_IN_NAMES[key] ?? key}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── One-time events section ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">One-Time Events</h2>
          <button
            onClick={() => { setShowAddForm(true); setNewType('one_time') }}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />Add event
          </button>
        </div>

        {localEvents.filter(e => e.event_type === 'one_time').map(event => (
          <EventCard
            key={event.id}
            event={event}
            displayDate={getEventDisplayDate(event)}
            serviceTypes={serviceTypes}
            expanded={expanded.has(event.id)}
            onToggle={() => toggleExpand(event.id)}
            onUpdateImpact={impacts => handleUpdateImpact(event.id, impacts)}
            onDelete={() => setDeleteConfirm(event.id)}
            onConfirmDelete={() => handleDelete(event.id)}
            deleteConfirm={deleteConfirm === event.id}
            onDeleteCancel={() => setDeleteConfirm(null)}
            saving={saving}
          />
        ))}

        {localEvents.filter(e => e.event_type === 'one_time').length === 0 && !showAddForm && (
          <p className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-xl">
            No one-time events yet
          </p>
        )}

        {/* Add form */}
        {showAddForm && (
          <div className="mt-3 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">New event</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Church Retreat, Guest Preacher"
                  className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Description (optional)</label>
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Any notes about this event"
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">Scheduling impact per service</label>
              <div className="space-y-2">
                {serviceTypes.map(st => (
                  <div key={st.key} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">{st.label}</span>
                    <ImpactSelector
                      value={newImpacts[st.key] ?? 'informational'}
                      onChange={v => setNewImpacts(prev => ({ ...prev, [st.key]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5" />{error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={handleAddCustom} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save event
              </button>
              <button onClick={() => { setShowAddForm(false); setError(null) }}
                className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Global error */}
      {error && !showAddForm && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {/* Inheritance note */}
      <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 leading-relaxed">
          Calendar settings apply globally. Series created after any change will automatically
          respect these dates. Existing series will show a conflict indicator when a calendar
          event falls on a planned week.
        </p>
      </div>
    </div>
  )
}

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({
  event, displayDate, serviceTypes, expanded, onToggle,
  onUpdateImpact, onDelete, onConfirmDelete, deleteConfirm, onDeleteCancel, saving,
}: {
  event: CalendarEventWithImpacts
  displayDate: string
  serviceTypes: { key: string; label: string }[]
  expanded: boolean
  onToggle: () => void
  onUpdateImpact: (impacts: { service_type: string; impact: ImpactType }[]) => void
  onDelete: () => void           // sets confirm state
  onConfirmDelete: () => void    // actually deletes
  onDeleteCancel: () => void
  deleteConfirm: boolean
  saving: boolean
}) {
  const [localImpacts, setLocalImpacts] = useState<Record<string, ImpactType>>(
    Object.fromEntries(event.calendar_service_impacts.map(i => [i.service_type, i.impact]))
  )
  const [dirty, setDirty] = useState(false)

  function handleImpactChange(serviceType: string, impact: ImpactType) {
    setLocalImpacts(prev => ({ ...prev, [serviceType]: impact }))
    setDirty(true)
  }

  function handleSave() {
    onUpdateImpact(serviceTypes.map(st => ({
      service_type: st.key,
      impact: localImpacts[st.key] ?? 'informational',
    })))
    setDirty(false)
  }

  // Summarize impacts for the collapsed view
  const impactSummary = serviceTypes
    .map(st => localImpacts[st.key] ?? 'informational')
    .filter(v => v !== 'informational')
  const nonDefaultCount = impactSummary.length

  return (
    <div className="bg-white border border-slate-200 rounded-xl mb-2 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-800">{event.name}</span>
            {event.recurrence_key && (
              <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">Recurring</span>
            )}
            {nonDefaultCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded-full">
                {nonDefaultCount} service{nonDefaultCount !== 1 ? 's' : ''} affected
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{displayDate}</p>
        </div>
        <button onClick={onToggle}
          className="p-1.5 text-slate-300 hover:text-slate-600 rounded transition-colors">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-3 bg-slate-50/40">
          {event.description && (
            <p className="text-xs text-slate-500 italic">{event.description}</p>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Scheduling impact per service
            </p>
            <div className="space-y-2">
              {serviceTypes.map(st => (
                <div key={st.key} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">{st.label}</span>
                  <ImpactSelector
                    value={localImpacts[st.key] ?? 'informational'}
                    onChange={v => handleImpactChange(st.key, v)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {dirty && (
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Save changes
              </button>
            )}
            {!deleteConfirm ? (
              <button onClick={onDelete}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors ml-auto">
                <Trash2 className="w-3 h-3" />Remove
              </button>
            ) : (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-red-600 font-medium">Remove this event?</span>
                <button onClick={onConfirmDelete} disabled={saving}
                  className="px-2.5 py-1 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes, remove'}
                </button>
                <button onClick={onDeleteCancel}
                  className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 transition-colors">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Impact selector ───────────────────────────────────────────────────────────

function ImpactSelector({ value, onChange }: { value: ImpactType; onChange: (v: ImpactType) => void }) {
  return (
    <div className="flex gap-1">
      {(Object.entries(IMPACT_LABELS) as [ImpactType, typeof IMPACT_LABELS[ImpactType]][]).map(([key, meta]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
            value === key
              ? `${meta.color} border-current`
              : 'text-slate-400 bg-white border-slate-200 hover:border-slate-400'
          }`}
          title={meta.desc}
        >
          {meta.label}
        </button>
      ))}
    </div>
  )
}
