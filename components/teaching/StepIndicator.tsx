import { Check } from 'lucide-react'
import type { StepState } from './TeachingWorkspace'

export function StepIndicator({ steps }: { steps: StepState[] }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center shrink-0">
          {/* Step pill */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            s.done       ? 'text-emerald-600 bg-emerald-50' :
            s.inProgress ? 'text-blue-600 bg-blue-50' :
            s.active     ? 'text-slate-900 bg-slate-100' :
            s.future     ? 'text-slate-300' :
            'text-slate-400'
          }`}>
            {s.done ? (
              <Check className="w-3 h-3 shrink-0" strokeWidth={2.5} />
            ) : s.inProgress ? (
              <span className="w-3 h-3 rounded-full border-2 border-blue-400 bg-blue-100 shrink-0" />
            ) : (
              <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                s.active ? 'border-slate-700 bg-slate-700' : 'border-slate-300'
              }`} />
            )}
            <span>{s.label}</span>
            {s.key === 'ai_review' && (
              <span className="text-[9px] font-medium text-slate-300 border border-slate-200 rounded px-1 leading-4">opt</span>
            )}
          </div>
          {/* Connector */}
          {i < steps.length - 1 && (
            <div className={`w-4 h-px mx-0.5 shrink-0 ${s.done ? 'bg-emerald-300' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}
