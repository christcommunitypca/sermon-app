'use client'

import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import type { BlockType, FlowStep, SessionType } from '@/types/database'

const BLOCK_TYPES: { value: BlockType; label: string }[] = [
  { value: 'point', label: 'Point' },
  { value: 'sub_point', label: 'Sub-point' },
  { value: 'scripture', label: 'Scripture' },
  { value: 'illustration', label: 'Illustration' },
  { value: 'application', label: 'Application' },
  { value: 'transition', label: 'Transition' },
]

const SESSION_TYPES: { value: SessionType; label: string }[] = [
  { value: 'sermon', label: 'Sermon' },
  { value: 'sunday_school', label: 'Sunday School' },
  { value: 'bible_study', label: 'Bible Study' },
]

type Props = {
  name: string
  description: string
  explanation: string
  steps: FlowStep[]
  defaultFor: SessionType | ''
  onNameChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onExplanationChange: (v: string) => void
  onDefaultForChange: (v: SessionType | '') => void
  onStepsChange: (v: FlowStep[]) => void
}

export function FlowBuilderFields(props: Props) {
  const {
    name, description, explanation, steps, defaultFor,
    onNameChange, onDescriptionChange, onExplanationChange, onDefaultForChange, onStepsChange,
  } = props

  function updateStep(index: number, updates: Partial<FlowStep>) {
    onStepsChange(steps.map((step, i) => (i === index ? { ...step, ...updates } : step)))
  }

  function addStep() {
    onStepsChange([
      ...steps,
      {
        id: crypto.randomUUID(),
        title: '',
        prompt_hint: '',
        suggested_block_type: 'point',
      },
    ])
  }

  function removeStep(index: number) {
    onStepsChange(steps.filter((_, i) => i !== index))
  }

  function moveStep(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    ;[next[index], next[target]] = [next[target], next[index]]
    onStepsChange(next)
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Flow name</label>
          <input value={name} onChange={e => onNameChange(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Short description</label>
          <input value={description} onChange={e => onDescriptionChange(e.target.value)} placeholder="What this flow helps you do" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">When to use it</label>
          <textarea value={explanation} onChange={e => onExplanationChange(e.target.value)} rows={3} placeholder="Explain when this flow is a good fit" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Flow steps</h2>
            <p className="text-xs text-slate-500 mt-1">The ordered movement the outline should follow.</p>
          </div>
          <button type="button" onClick={addStep} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50">
            <Plus className="w-4 h-4" />Add step
          </button>
        </div>

        <div className="space-y-3">
          {!steps.length && (
            <div className="border border-dashed border-slate-300 rounded-xl px-4 py-8 text-sm text-slate-500 text-center">
              No steps yet. Add the movements you want this sermon flow to follow.
            </div>
          )}
          {steps.map((step, index) => (
            <div key={step.id ?? index} className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"><ChevronUp className="w-4 h-4" /></button>
                  <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"><ChevronDown className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 grid gap-3 md:grid-cols-[1.1fr,0.9fr,auto]">
                  <input value={step.title} onChange={e => updateStep(index, { title: e.target.value })} placeholder="Step title" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  <input value={step.prompt_hint ?? ''} onChange={e => updateStep(index, { prompt_hint: e.target.value || null })} placeholder="Optional prompt hint" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  <select value={step.suggested_block_type ?? 'point'} onChange={e => updateStep(index, { suggested_block_type: e.target.value as BlockType })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                    {BLOCK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <button type="button" onClick={() => removeStep(index)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Availability & defaults</h2>
          <p className="text-xs text-slate-500 mt-1">Only use a shared default when you want this flow to be the obvious starting point for that lesson type.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Default lesson type</label>
          <select value={defaultFor} onChange={e => onDefaultForChange(e.target.value as SessionType | '')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">Not a default</option>
            {SESSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </section>
    </div>
  )
}
