'use client'

import { useState } from 'react'
import { Clock, RotateCcw, Tag } from 'lucide-react'
import { restoreSnapshotAction } from '@/app/(app)/[churchSlug]/teaching/[sessionId]/outline-actions'

interface SnapshotRow {
  id: string
  version_number: number
  label: string | null
  created_at: string
  created_by: string | null
}

interface Props {
  snapshots: SnapshotRow[]
  sessionId: string
  outlineId: string
  churchId: string
  churchSlug: string
}

export function SnapshotHistory({ snapshots, sessionId, outlineId, churchId, churchSlug }: Props) {
  const [restoring, setRestoring] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null)

  async function handleRestore(versionNumber: number) {
    setRestoring(versionNumber)
    setError(null)

    const result = await restoreSnapshotAction(sessionId, outlineId, churchId, churchSlug, versionNumber)
    if (result.error) {
      setError(result.error)
    } else {
      window.location.href = `/${churchSlug}/teaching/${sessionId}`
    }
    setRestoring(null)
    setConfirmVersion(null)
  }

  if (snapshots.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Clock className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No versions saved yet.</p>
        <p className="text-xs mt-1">Use "Save version" in the outline editor to create a named snapshot.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <p className="text-xs text-slate-400">
        Restoring replaces the current outline with the selected version.
        Your current state is automatically saved before any restore.
      </p>

      <div className="space-y-2">
        {snapshots.map(snap => (
          <div
            key={snap.id}
            className="flex items-center justify-between px-4 py-3 bg-white border border-slate-100 rounded-xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-medium text-slate-500">v{snap.version_number}</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {snap.label ?? 'Auto-save'}
                  </span>
                  {snap.label && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <Tag className="w-3 h-3" />
                      Labeled
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(snap.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            <div>
              {confirmVersion === snap.version_number ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Restore this version?</span>
                  <button
                    onClick={() => handleRestore(snap.version_number)}
                    disabled={restoring === snap.version_number}
                    className="px-2.5 py-1 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {restoring === snap.version_number ? 'Restoring…' : 'Yes, restore'}
                  </button>
                  <button
                    onClick={() => setConfirmVersion(null)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmVersion(snap.version_number)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restore
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
