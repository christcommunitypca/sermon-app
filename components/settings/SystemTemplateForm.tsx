'use client'

import { useState } from 'react'

type Step = { id: string; title: string; prompt_hint?: string | null; suggested_block_type?: string | null }

export function SystemTemplateForm({ action, churchSlug, initialName = '', initialDescription = '', initialExplanation = '', initialSteps = [], submitLabel }: { action: (formData: FormData) => void | Promise<void>; churchSlug: string; initialName?: string; initialDescription?: string; initialExplanation?: string; initialSteps?: Step[]; submitLabel: string }) {
  const [steps, setSteps] = useState<Step[]>(initialSteps.length ? initialSteps : [
    { id: '1', title: 'Text', suggested_block_type: 'point' },
    { id: '2', title: 'Grace', suggested_block_type: 'point' },
    { id: '3', title: 'Response', suggested_block_type: 'application' },
  ])

  function updateStep(index: number, patch: Partial<Step>) {
    const next = [...steps]
    next[index] = { ...next[index], ...patch }
    setSteps(next)
  }

  function addStep() {
    setSteps(prev => [...prev, { id: String(prev.length + 1), title: '', suggested_block_type: 'point' }])
  }

  function removeStep(index: number) {
    setSteps(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="churchSlug" value={churchSlug} />
      <input type="hidden" name="steps" value={JSON.stringify(steps)} />
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Template name</label>
        <input name="name" defaultValue={initialName} required className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Short description</label>
        <input name="description" defaultValue={initialDescription} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">When to use it</label>
        <textarea name="explanation" defaultValue={initialExplanation} rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Flow steps</h2>
          <button type="button" onClick={addStep} className="text-sm text-violet-700 hover:text-violet-800">Add step</button>
        </div>
        {steps.map((step, index) => (
          <div key={step.id ?? index} className="grid gap-3 md:grid-cols-[1.5fr_1fr_auto] items-end border border-slate-200 rounded-xl p-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Step title</label>
              <input value={step.title} onChange={e => updateStep(index, { title: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Block type</label>
              <select value={step.suggested_block_type ?? 'point'} onChange={e => updateStep(index, { suggested_block_type: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                <option value="point">Point</option><option value="sub_point">Sub-point</option><option value="scripture">Scripture</option><option value="illustration">Illustration</option><option value="application">Application</option><option value="transition">Transition</option>
              </select>
            </div>
            <button type="button" onClick={() => removeStep(index)} className="px-3 py-2 text-sm text-red-600 hover:text-red-700">Remove</button>
          </div>
        ))}
      </div>
      <div className="flex justify-end"><button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium">{submitLabel}</button></div>
    </form>
  )
}
