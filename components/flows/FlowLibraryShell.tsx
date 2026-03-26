'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { Flow } from '@/types/database'

type Props = {
  churchSlug: string
  flows: Flow[]
  selectedFlowId?: string | null
  createHref: string
  createLabel?: string
  children: React.ReactNode
}

export function FlowLibraryShell({ churchSlug, flows, selectedFlowId, createHref, createLabel = 'Create Flow', children }: Props) {
  const [open, setOpen] = useState(true)

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={() => setOpen(v => !v)} className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
          {open ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Flow Library</h1>
          <p className="text-sm text-slate-500 mt-1">Choose an existing flow on the left, or create a new one.</p>
        </div>
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: open ? '280px minmax(0,1fr)' : 'minmax(0,1fr)' }}>
        {open && (
          <aside className="bg-white border border-slate-200 rounded-2xl p-4 h-fit sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Existing flows</h2>
              <Link href={createHref} className="inline-flex items-center gap-1 text-sm text-slate-700 hover:text-slate-900">
                <Plus className="w-4 h-4" />{createLabel}
              </Link>
            </div>
            <div className="space-y-2">
              {flows.map(flow => (
                <Link key={flow.id} href={`/${churchSlug}/flows/${flow.id}`} className={`block border rounded-xl px-3 py-3 transition-colors ${selectedFlowId === flow.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="text-sm font-medium text-slate-900">{flow.name}</div>
                  {flow.description && <div className="text-xs text-slate-500 mt-1 line-clamp-2">{flow.description}</div>}
                </Link>
              ))}
              {!flows.length && (
                <div className="border border-dashed border-slate-300 rounded-xl px-3 py-6 text-sm text-slate-500 text-center">
                  No flows yet.
                </div>
              )}
            </div>
          </aside>
        )}
        <main>{children}</main>
      </div>
    </div>
  )
}
