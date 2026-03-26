'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createSessionAction, updateSessionAction } from '@/app/(app)/[churchSlug]/teaching/actions'
import { Flow, TeachingSession } from '@/types/database'
import type { LessonTypeOption } from '@/lib/lesson-types'

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
  lessonTypes?: LessonTypeOption[]
  selectedFlowId?: string
  seriesContext?: SeriesContext | null
}

export function SessionForm({
  churchId,
  churchSlug,
  session,
  flows = [],
  lessonTypes = [],
  selectedFlowId,
  seriesContext,
}: Props) {
  const isEdit = !!session
  const action = isEdit ? updateSessionAction : createSessionAction

  const initialType = session?.type ?? lessonTypes[0]?.key ?? 'sermon'
  const [lessonType, setLessonType] = useState(initialType)

  const fallbackDefaultFlowId = useMemo(() => {
    const matched = lessonTypes.find(type => type.key === lessonType)
    return matched?.default_flow_id ?? ''
  }, [lessonTypes, lessonType])

  const effectiveSelectedFlowId =
    session?.selected_flow_id ?? selectedFlowId ?? fallbackDefaultFlowId ?? ''

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="churchId" value={churchId} />
      <input type="hidden" name="churchSlug" value={churchSlug} />
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
          <label className="block text-sm font-medium text-slate-700 mb-1">Lesson type</label>
          <select
            name="type"
            value={lessonType}
            onChange={e => setLessonType(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
          >
            {lessonTypes.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
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

      {!!lessonTypes.find(t => t.key === lessonType)?.description && (
        <p className="text-xs text-slate-500 -mt-2">{lessonTypes.find(t => t.key === lessonType)?.description}</p>
      )}

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
                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                  })
                : 'Set by series'}
              <p className="text-xs text-slate-400 mt-0.5">
                Managed in <a href={`/${churchSlug}/series/${seriesContext.seriesId}`} className="text-violet-600 hover:underline">{seriesContext.seriesTitle}</a> · Week {seriesContext.weekNumber}
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
          className="w-40 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Flow</label>
        {flows.length === 0 ? (
          <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50">
            <p className="text-sm text-slate-600">No flows created yet for this church.</p>
            <Link href={`/${churchSlug}/settings/church-setup/flows`} className="inline-flex mt-3 text-sm font-medium text-violet-700 hover:text-violet-800">
              Create a Flow
            </Link>
          </div>
        ) : (
          <>
            <select
              name="flow_id"
              defaultValue={effectiveSelectedFlowId}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
            >
              <option value="">No flow — start blank</option>
              {flows.map(flow => (
                <option key={flow.id} value={flow.id}>{flow.name}</option>
              ))}
            </select>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {fallbackDefaultFlowId ? 'The church default for this lesson type is preselected when available.' : 'Choose a flow only if you want one to guide outline generation.'}
              </span>
              <Link href={`/${churchSlug}/settings/church-setup/flows`} className="font-medium text-violet-700 hover:text-violet-800">
                Create a Flow
              </Link>
            </div>
          </>
        )}
      </div>

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
        <button type="submit" className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
          {isEdit ? 'Save changes' : 'Create session'}
        </button>
        <a href={isEdit ? `/${churchSlug}/teaching/${session.id}` : `/${churchSlug}/teaching`} className="text-sm text-slate-500 hover:text-slate-700">
          Cancel
        </a>
      </div>
    </form>
  )
}
