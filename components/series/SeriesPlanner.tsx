'use client'

import { useState } from 'react'
import { Calendar, BookOpen, Edit2, Check, X, AlertCircle } from 'lucide-react'
import { ProposedWeek } from '@/types/database'
import { LiturgicalObservance } from '@/lib/liturgical'
import { createSeriesAction } from '@/app/(app)/[churchSlug]/series/actions'

interface Props {
  churchId: string
  churchSlug: string
  formData: {
    title: string
    description: string
    scriptureSection: string
    totalWeeks: number
    startDate: string
  }
  initialWeeks: ProposedWeek[]
  observances: (LiturgicalObservance & { weekOffset: number })[]
}

export function SeriesPlanner({ churchId, churchSlug, formData, initialWeeks, observances }: Props) {
  const [weeks, setWeeks] = useState<ProposedWeek[]>(initialWeeks)
  const [editingWeek, setEditingWeek] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Observances keyed by week number for quick lookup
  const obsByWeek = new Map<number, (LiturgicalObservance & { weekOffset: number })[]>()
  for (const obs of observances) {
    const existing = obsByWeek.get(obs.weekOffset) ?? []
    obsByWeek.set(obs.weekOffset, [...existing, obs])
  }

  function updateWeek(weekNum: number, updates: Partial<ProposedWeek>) {
    setWeeks(prev => prev.map(w => w.week_number === weekNum ? { ...w, ...updates } : w))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const result = await createSeriesAction(churchId, churchSlug, {
        title: formData.title,
        description: formData.description || null,
        scriptureSection: formData.scriptureSection,
        totalWeeks: formData.totalWeeks,
        startDate: formData.startDate || null,
        weeks,
      })
      if (result?.error) {
        setError(result.error)
        setSaving(false)
      }
      // On success, createSeriesAction calls redirect() which navigates the page
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save series')
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{formData.title}</h2>
          <p className="text-sm text-slate-500">{formData.scriptureSection} · {formData.totalWeeks} weeks</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save series'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2.5 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      <p className="text-xs text-slate-400 mb-5">Review and edit the proposed plan. Adjust titles, scriptures, and notes before saving.</p>

      <div className="space-y-3">
        {weeks.map(week => {
          const weekObs = obsByWeek.get(week.week_number) ?? []
          const isEditing = editingWeek === week.week_number

          // Compute date if start date provided
          let weekDate: string | null = null
          if (formData.startDate) {
            const d = new Date(formData.startDate)
            d.setDate(d.getDate() + (week.week_number - 1) * 7)
            weekDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          }

          return (
            <div key={week.week_number}
              className={`bg-white border rounded-xl overflow-hidden transition-all ${weekObs.length > 0 ? 'border-amber-200' : 'border-slate-100'}`}
            >
              {/* Week header */}
              <div className="flex items-center gap-4 px-4 py-3 bg-slate-50 border-b border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {week.week_number}
                </div>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <input
                      value={week.proposed_title ?? ''}
                      onChange={e => updateWeek(week.week_number, { proposed_title: e.target.value })}
                      className="w-full text-sm font-medium bg-white border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      autoFocus
                    />
                  ) : (
                    <p className="text-sm font-medium text-slate-900 truncate">{week.proposed_title}</p>
                  )}
                </div>
                {weekDate && (
                  <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />{weekDate}
                  </span>
                )}
                {isEditing ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditingWeek(null)}
                      title="Done"
                      className="p-1.5 text-emerald-600 hover:text-emerald-800 rounded transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingWeek(null)}
                      title="Cancel"
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingWeek(week.week_number)}
                    className="shrink-0 p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
                    title="Edit week"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Week body */}
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  {isEditing ? (
                    <input
                      value={week.proposed_scripture ?? ''}
                      onChange={e => updateWeek(week.week_number, { proposed_scripture: e.target.value })}
                      className="text-sm bg-white border border-slate-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-slate-400 flex-1"
                      placeholder="Scripture passage"
                    />
                  ) : (
                    <span className="text-sm text-blue-600 font-medium">{week.proposed_scripture}</span>
                  )}
                </div>

                {isEditing ? (
                  <textarea
                    value={week.notes ?? ''}
                    onChange={e => updateWeek(week.week_number, { notes: e.target.value })}
                    rows={2}
                    className="w-full text-xs text-slate-600 bg-white border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-slate-400 resize-none"
                    placeholder="Preparation notes"
                  />
                ) : (
                  week.notes && <p className="text-xs text-slate-500">{week.notes}</p>
                )}

                {/* Liturgical notes */}
                {(week.liturgical_note || weekObs.length > 0) && (
                  <div className="flex items-start gap-1.5 mt-1 px-2 py-1.5 bg-amber-50 rounded-lg border border-amber-100">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-700">
                      {weekObs.map(obs => (
                        <p key={obs.name}><strong>{obs.name}</strong> — {obs.description}</p>
                      ))}
                      {week.liturgical_note && !weekObs.length && <p>{week.liturgical_note}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
