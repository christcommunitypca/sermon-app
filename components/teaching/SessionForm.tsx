'use client'

import { useState } from 'react'
import { TeachingSession, SessionType, Visibility } from '@/types/database'
import { createSessionAction, updateSessionAction } from '@/app/(app)/[churchSlug]/teaching/actions'
import { Flow } from '@/types/database'

const SESSION_TYPES: { value: SessionType; label: string }[] = [
  { value: 'sermon', label: 'Sermon' },
  { value: 'sunday_school', label: 'Sunday School' },
  { value: 'bible_study', label: 'Bible Study' },
]

const VISIBILITY_OPTIONS: { value: Visibility; label: string; desc: string }[] = [
  { value: 'private', label: 'Private', desc: 'Only you' },
  { value: 'church', label: 'Church', desc: 'All church members' },
]

interface Props {
  churchId: string
  churchSlug: string
  session?: TeachingSession
  flows?: Flow[]
  selectedFlowId?: string
}

export function SessionForm({ churchId, churchSlug, session, flows = [], selectedFlowId }: Props) {
  const isEdit = !!session
  const action = isEdit ? updateSessionAction : createSessionAction

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
          <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
          <select
            name="type"
            defaultValue={session?.type ?? 'sermon'}
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

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Scheduled delivery date</label>
          <input
            name="scheduled_date"
            type="date"
            defaultValue={session?.scheduled_date ?? ''}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
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

      {!isEdit && flows.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Apply flow (optional)</label>
          <select
            name="flow_id"
            defaultValue={selectedFlowId ?? ''}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
          >
            <option value="">No flow — start blank</option>
            {flows.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
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
