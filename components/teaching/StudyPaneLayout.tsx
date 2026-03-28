'use client'

import type { ReactNode } from 'react'

export type StudyPaneKey = 'scripture' | 'notes' | 'research'

const PANE_LABELS: Record<StudyPaneKey, string> = {
  scripture: 'Scripture',
  notes: 'Notes',
  research: 'AI',
}

export function StudyPaneLayout({
  paneVisibility,
  mobileTab,
  onMobileTabChange,
  renderPane,
  resizable = false,
  desktopGridTemplate,
  onResizeStart,
  desktopClassName = 'hidden md:grid flex-1 min-h-0 relative',
  mobileClassName = 'md:hidden p-4 flex-1 min-h-0 overflow-y-auto',
  desktopPanePaddingClassName = 'h-full min-h-0 p-4 overflow-y-auto',
}: {
  paneVisibility: { scripture: boolean; notes: boolean; research: boolean }
  mobileTab: StudyPaneKey
  onMobileTabChange: (pane: StudyPaneKey) => void
  renderPane: (pane: StudyPaneKey) => ReactNode
  resizable?: boolean
  desktopGridTemplate?: string
  onResizeStart?: (left: StudyPaneKey, right: StudyPaneKey, clientX: number) => void
  desktopClassName?: string
  mobileClassName?: string
  desktopPanePaddingClassName?: string
}) {
  const visiblePanes = (['scripture', 'notes', 'research'] as const).filter(p => paneVisibility[p])

  return (
    <>
      <div className="md:hidden px-3 pt-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {visiblePanes.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => onMobileTabChange(tab)}
              className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ${mobileTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              {PANE_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      <div
        className={desktopClassName}
        style={{ gridTemplateColumns: desktopGridTemplate ?? `repeat(${visiblePanes.length || 1}, minmax(0, 1fr))` }}
      >
        {visiblePanes.map((pane, idx) => (
          <div key={pane} className="relative min-h-0 overflow-hidden">
            <div className={desktopPanePaddingClassName}>
              {renderPane(pane)}
            </div>

            {resizable && onResizeStart && idx < visiblePanes.length - 1 && (
              <div
                onMouseDown={(e) => onResizeStart(pane, visiblePanes[idx + 1], e.clientX)}
                className="absolute top-0 right-0 h-full w-2 cursor-col-resize group z-10"
                title="Resize panes"
              >
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-slate-200 group-hover:bg-violet-300" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={mobileClassName}>
        {renderPane(mobileTab)}
      </div>
    </>
  )
}
