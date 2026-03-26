'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Sparkles } from 'lucide-react'
import type { Flow, SelectedFlowSnapshot, SessionType } from '@/types/database'
import { setSessionFlowAction } from '@/app/(app)/[churchSlug]/teaching/actions'

const TYPE_LABELS: Record<SessionType, string> = {
  sermon: 'Sermon',
  sunday_school: 'Sunday School',
  bible_study: 'Bible Study',
}

export function SessionFlowManager({
  sessionId,
  churchId,
  churchSlug,
  sessionType,
  flows,
  currentFlow,
}: {
  sessionId: string
  churchId: string
  churchSlug: string
  sessionType: SessionType
  flows: Flow[]
  currentFlow: SelectedFlowSnapshot | null
}) {
  const router = useRouter()
  const [selectedFlowId, setSelectedFlowId] = useState(currentFlow?.id ?? '')
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const sortedFlows = useMemo(() => {
    return [...flows].sort((a, b) => {
      const score = (flow: Flow) => {
        if (flow.id === selectedFlowId) return 100
        if (flow.is_default_for === sessionType) return 80
        if ((flow.recommended_for ?? []).includes(sessionType)) return 60
        return 0
      }
      const delta = score(b) - score(a)
      if (delta !== 0) return delta
      return a.name.localeCompare(b.name)
    })
  }, [flows, selectedFlowId, sessionType])

  function chooseFlow(flowId: string | null) {
    const nextId = flowId ?? ''
    setSelectedFlowId(nextId)
    setError(null)
    startTransition(async () => {
      const result = await setSessionFlowAction({
        sessionId,
        churchId,
        churchSlug,
        flowId,
      })
      if (result?.error) {
        setError(result.error)
      } else {
        setExpanded(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">Sermon flow</div>
            {currentFlow ? (
              <>
                <div className="text-sm text-slate-900 mt-1">{currentFlow.name}</div>
                {currentFlow.description && <p className="text-sm text-slate-500 mt-1">{currentFlow.description}</p>}
                {currentFlow.explanation && <p className="text-xs text-slate-600 mt-2 leading-5">{currentFlow.explanation}</p>}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {currentFlow.steps.slice(0, 6).map((step, idx) => (
                    <span key={step.id ?? idx} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {step.title}
                    </span>
                  ))}
                  {currentFlow.steps.length > 6 && (
                    <span className="text-[11px] text-slate-400">+{currentFlow.steps.length - 6} more</span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500 mt-1">No sermon flow is attached yet. Pick one here and your outline prompt will follow it.</p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 shrink-0"
        >
          {currentFlow ? 'Change flow' : 'Choose flow'}
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
          <div className="text-xs text-slate-500">Recommended and default flows for {TYPE_LABELS[sessionType]} rise to the top.</div>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => chooseFlow(null)}
              disabled={isPending}
              className={`text-left border rounded-xl p-4 transition-colors ${selectedFlowId === '' ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'} disabled:opacity-60`}
            >
              <div className="text-sm font-medium text-slate-900">No flow</div>
              <div className="text-xs text-slate-500 mt-1">Let the outline build with a general structure instead of a named sermon path.</div>
            </button>

            {sortedFlows.map(flow => {
              const isSelected = selectedFlowId === flow.id
              const isDefault = flow.is_default_for === sessionType
              const isRecommended = (flow.recommended_for ?? []).includes(sessionType)
              return (
                <button
                  key={flow.id}
                  type="button"
                  onClick={() => chooseFlow(flow.id)}
                  disabled={isPending}
                  className={`text-left border rounded-xl p-4 transition-colors ${isSelected ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'} disabled:opacity-60`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{flow.name}</div>
                      {flow.description && <div className="text-xs text-slate-500 mt-1">{flow.description}</div>}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {isDefault && <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">Default</span>}
                      {!isDefault && isRecommended && <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">Recommended</span>}
                    </div>
                  </div>
                  {flow.explanation && <p className="text-xs text-slate-600 mt-2 line-clamp-2">{flow.explanation}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {flow.steps.slice(0, 5).map((step, idx) => (
                      <span key={step.id ?? idx} className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                        {step.title}
                      </span>
                    ))}
                    {flow.steps.length > 5 && <span className="text-[11px] text-slate-400">+{flow.steps.length - 5} more</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
