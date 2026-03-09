'use client'

import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal, Archive, ArchiveRestore, Trash2, AlertTriangle } from 'lucide-react'

interface Props {
  isArchived: boolean
  onArchive: () => Promise<void>
  onUnarchive?: () => Promise<void>
  onDelete: () => Promise<void>
  entityLabel?: string
  size?: 'sm' | 'md'
}

export function ArchiveDeleteMenu({
  isArchived,
  onArchive,
  onUnarchive,
  onDelete,
  entityLabel = 'item',
  size = 'sm',
}: Props) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Track whether the popover should open upward (near bottom of screen)
  const [openUp, setOpenUp] = useState(false)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirming(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleToggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!open && ref.current) {
      // Check if we're near the bottom of the viewport
      const rect = ref.current.getBoundingClientRect()
      setOpenUp(rect.bottom > window.innerHeight - 180)
    }
    setOpen(o => !o)
    setConfirming(false)
  }

  async function handleArchive(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    setBusy(true); setOpen(false)
    await onArchive()
    setBusy(false)
  }

  async function handleUnarchive(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    if (!onUnarchive) return
    setBusy(true); setOpen(false)
    await onUnarchive()
    setBusy(false)
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    setBusy(true); setConfirming(false); setOpen(false)
    await onDelete()
    setBusy(false)
  }

  // Minimum 44px touch target for iOS
  const btnClass = 'min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40'

  const popoverPosition = openUp
    ? 'absolute right-0 bottom-full mb-1 z-50'
    : 'absolute right-0 top-full mt-1 z-50'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleToggle}
        disabled={busy}
        className={btnClass}
        title="More actions"
        aria-label="More actions"
        aria-expanded={open}
      >
        <MoreHorizontal className={size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      </button>

      {open && !confirming && (
        <div className={`${popoverPosition} w-48 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden`}>
          {!isArchived ? (
            <button
              onClick={handleArchive}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
            >
              <Archive className="w-4 h-4 text-slate-400 shrink-0" />
              Archive
            </button>
          ) : (
            <>
              {onUnarchive && (
                <button
                  onClick={handleUnarchive}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
                >
                  <ArchiveRestore className="w-4 h-4 text-slate-400 shrink-0" />
                  Unarchive
                </button>
              )}
              <div className="border-t border-slate-100 mx-2" />
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirming(true) }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors text-left"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                Delete permanently
              </button>
            </>
          )}
        </div>
      )}

      {/* Delete confirmation — fixed width, safe for iPhone SE (320px) */}
      {confirming && (
        <div className={`${popoverPosition} w-60 bg-white border border-red-200 rounded-xl shadow-lg p-4`}>
          <div className="flex items-start gap-2.5 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900 mb-0.5">Delete this {entityLabel}?</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                This cannot be undone. All content inside will be permanently removed.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={busy}
              className="flex-1 px-3 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 active:bg-red-800 disabled:opacity-50 transition-colors"
            >
              {busy ? 'Deleting…' : 'Delete'}
            </button>
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirming(false); setOpen(false) }}
              className="flex-1 px-3 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
