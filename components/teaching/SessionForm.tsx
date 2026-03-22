'use client'

import { useEffect, useMemo, useState } from 'react'
import { createSessionAction, updateSessionAction } from '@/app/(app)/[churchSlug]/teaching/actions'
import { Flow, SessionType, TeachingSession } from '@/types/database'

const SESSION_TYPES: { value: SessionType; label: string }[] = [
  { value: 'sermon', label: 'Sermon' },
  { value: 'sunday_school', label: 'Sunday School' },
  { value: 'bible_study', label: 'Bible Study' },
]

const VISIBILITY_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: 'private', label: 'Private', desc: 'Only you' },
  { value: 'church', label: 'Church', desc: 'All church members' },
]

interface SeriesContext {
  seriesId: string
  seriesTitle: string
  weekNumber: number
}

interface Props {
  churchId: string
  churchSlug: string
  session?: TeachingSession
  flows?: Flow[]
  selectedFlowId?: string
  seriesContext?: SeriesContext | null
}

function typeLabel(type: SessionType) {
  return SESSION_TYPES.find(t => t.value === type)?.label ?? type
}

export function SessionForm({
  churchId,
  churchSlug,
  session,
  flows = [],
  selectedFlowId,
  seriesContext,
}: Props) {
  const isEdit = !!session
  const action = isEdit ? updateSessionAction : createSessionAction

  const [typeValue, setTypeValue] = useState<SessionType>(session?.type ?? 'sermon')
  const [selectedFlowIdState, setSelectedFlowIdState] = useState(
    session?.selected_flow_id ?? selectedFlowId ?? ''
  )

  useEffect(() => {
    if (session?.selected_flow_id) return
    if (selectedFlowIdState) return
    const defaultMatch = flows.find(flow => flow.is_default_for === typeValue)
    if (defaultMatch) setSelectedFlowIdState(defaultMatch.id)
  }, [flows, selectedFlowIdState, session?.selected_flow_id, typeValue])

  const sortedFlows = useMemo(() => {
    const ranked = [...flows]
    ranked.sort((a, b) => {
      const score = (flow: Flow) => {
        if (flow.id === selectedFlowIdState) return 100
        if (flow.is_default_for === typeValue) return 80
        if ((flow.recommended_for ?? []).includes(typeValue)) return 60
        return 0
      }
      return score(b) - score(a) || a.name.localeCompare(b.name)
    })
    return ranked
  }, [flows, selectedFlowIdState, typeValue])

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="churchId" value={churchId} />
      <input type="hidden" name="churchSlug" value={churchSlug} />
      <input type="hidden" name="flow_id" value={selectedFlowIdState} />
      {isEdit && <input type="hidden" name="sessionId" value={session.id} />}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
        <input
          name="title"
          type="text"
          required
          defaultValue={session?.title}
          placeholder="Sermon title"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          autoFocus={!isEdit}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
          <select
            name="type"
            value={typeValue}
            onChange={e => setTypeValue(e.target.value as SessionType)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
          >
            {SESSION_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Visibility</label>
          <select
            name="visibility"
            defaultValue={session?.visibility ?? 'church'}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
          >
            {VISIBILITY_OPTIONS.map(v => (
              <option key={v.value} value={v.value}>{v.label} — {v.desc}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {isEdit && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Scripture</label>
            <input
              name="scripture_ref"
              type="text"
              defaultValue={session?.scripture_ref ?? ''}
              placeholder="e.g. John 3:16"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Scheduled delivery date</label>
          {seriesContext ? (
            <div className="px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-sm text-slate-500">
              {session?.scheduled_date
                ? new Date(session.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Set by series'}
              <p className="text-xs text-slate-400 mt-0.5">
                Managed in{' '}
                <a
                  href={`/${churchSlug}/series/${seriesContext.seriesId}`}
                  className="text-violet-600 hover:underline"
                >
                  {seriesContext.seriesTitle}
                </a>{' '}
                · Week {seriesContext.weekNumber}
              </p>
            </div>
          ) : (
            <input
              name="scheduled_date"
              type="date"
              defaultValue={session?.scheduled_date ?? ''}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Est. duration (min)</label>
        <input
          name="estimated_duration"
          type="number"
          min="1"
          max="240"
          defaultValue={session?.estimated_duration ?? ''}
          placeholder="30"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 w-40"
        />
      </div>

      {flows.length > 0 && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Sermon flow</label>
            <p className="text-xs text-slate-400 mt-1">Choose the preaching path this lesson should follow. Flow steps will guide outline generation and prompt preview.</p>
          </div>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setSelectedFlowIdState('')}
              className={`text-left border rounded-xl p-4 transition-colors ${selectedFlowIdState === '' ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="text-sm font-medium text-slate-900">No flow</div>
              <div className="text-xs text-slate-500 mt-1">Start with a blank outline movement.</div>
            </button>

            {sortedFlows.map(flow => {
              const isSelected = selectedFlowIdState === flow.id
              const isDefault = flow.is_default_for === typeValue
              const isRecommended = (flow.recommended_for ?? []).includes(typeValue)
              return (
                <button
                  key={flow.id}
                  type="button"
                  onClick={() => setSelectedFlowIdState(flow.id)}
                  className={`text-left border rounded-xl p-4 transition-colors ${isSelected ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{flow.name}</div>
                      {flow.description && <div className="text-xs text-slate-500 mt-1">{flow.description}</div>}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {isDefault && <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">Default for {typeLabel(typeValue)}</span>}
                      {!isDefault && isRecommended && <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">Recommended</span>}
                    </div>
                  </div>
                  {flow.explanation && <p className="text-xs text-slate-600 mt-2 line-clamp-2">{flow.explanation}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {flow.steps.slice(0, 5).map((step, i) => (
                      <span key={step.id ?? i} className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                        {step.title}
                      </span>
                    ))}
                    {flow.steps.length > 5 && (
                      <span className="text-[11px] text-slate-400">+{flow.steps.length - 5} more</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
        <textarea
          name="notes"
          defaultValue={session?.notes ?? ''}
          rows={4}
          placeholder="Key ideas, themes, or preparation notes…"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors"
        >
          {isEdit ? 'Save changes' : 'Create session'}
        </button>
        <a
          href={isEdit ? `/${churchSlug}/teaching/${session.id}` : `/${churchSlug}/teaching`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}
