'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { createFlowAction } from '@/app/(app)/[churchSlug]/flows/actions'
import { BlockType, FlowStep, SessionType } from '@/types/database'

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

function makeStep(title = '', suggested_block_type: BlockType = 'point'): FlowStep {
  return { id: crypto.randomUUID(), title, prompt_hint: '', suggested_block_type }
}

export function FlowCreateForm({ churchId, churchSlug }: { churchId: string; churchSlug: string }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [explanation, setExplanation] = useState('')
  const [defaultFor, setDefaultFor] = useState<SessionType | ''>('')
  const [recommendedFor, setRecommendedFor] = useState<SessionType[]>([])
  const [steps, setSteps] = useState<FlowStep[]>([
    makeStep('Opening movement'),
    makeStep('Main burden'),
    makeStep('Response', 'application'),
  ])

  function addStep() {
    setSteps(prev => [...prev, makeStep()])
  }

  function updateStep(i: number, patch: Partial<FlowStep>) {
    setSteps(prev => prev.map((step, idx) => (idx === i ? { ...step, ...patch } : step)))
  }

  function removeStep(i: number) {
    setSteps(prev => prev.filter((_, idx) => idx !== i))
  }

  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    ;[next[i], next[j]] = [next[j], next[i]]
    setSteps(next)
  }

  function toggleRecommended(type: SessionType) {
    setRecommendedFor(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
  }

  const stepsJson = useMemo(() => JSON.stringify(steps), [steps])
  const recommendedJson = useMemo(() => JSON.stringify(recommendedFor), [recommendedFor])

  return (
    <form action={createFlowAction} className="space-y-6">
      <input type="hidden" name="churchId" value={churchId} />
      <input type="hidden" name="churchSlug" value={churchSlug} />
      <input type="hidden" name="steps" value={stepsJson} />
      <input type="hidden" name="recommended_for" value={recommendedJson} />

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Flow name</label>
          <input
            name="name"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Problem / Grace / Response"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Short description</label>
          <input
            name="description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="A brief summary pastors can scan quickly"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">What this flow means / when to use it</label>
          <textarea
            name="explanation"
            value={explanation}
            onChange={e => setExplanation(e.target.value)}
            rows={4}
            placeholder="Describe the kind of sermon movement this flow creates and when it fits best."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Default for type</label>
            <select
              name="is_default_for"
              value={defaultFor}
              onChange={e => setDefaultFor((e.target.value as SessionType) || '')}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">Not a default</option>
              {SESSION_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Recommended for</label>
            <div className="flex flex-wrap gap-2">
              {SESSION_TYPES.map(type => {
                const active = recommendedFor.includes(type.value)
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => toggleRecommended(type.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-violet-50 border-violet-300 text-violet-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
                  >
                    {type.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Flow steps</h2>
            <p className="text-sm text-slate-500 mt-1">These steps are the sermon path the outline prompt will follow.</p>
          </div>
          <button type="button" onClick={addStep} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-colors">
            <Plus className="w-4 h-4" />Add step
          </button>
        </div>

        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={step.id ?? i} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Step title</label>
                  <input
                    value={step.title}
                    onChange={e => updateStep(i, { title: e.target.value })}
                    placeholder="e.g. Story, Tension, Gospel, Response"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Suggested block type</label>
                  <select
                    value={step.suggested_block_type ?? 'point'}
                    onChange={e => updateStep(i, { suggested_block_type: e.target.value as BlockType })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    {BLOCK_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                  <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                  <button type="button" onClick={() => removeStep(i)} className="p-2 rounded-lg border border-red-200 bg-white text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">Prompt hint</label>
                <input
                  value={step.prompt_hint ?? ''}
                  onChange={e => updateStep(i, { prompt_hint: e.target.value || null })}
                  placeholder="Optional: tell the AI what should happen in this step"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
          Create flow
        </button>
        <p className="text-sm text-slate-400">You can refine the flow further after creating it.</p>
      </div>
    </form>
  )
}
