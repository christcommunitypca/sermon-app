'use client'

import { useMemo, useState } from 'react'
import type { FlowStep, SessionType } from '@/types/database'
import { createFlowAction } from '@/app/(app)/[churchSlug]/flows/actions'
import { FlowBuilderFields } from '@/components/flows/FlowBuilderFields'
import { FLOW_TEMPLATES } from '@/lib/flow-templates'

export function FlowCreateForm({ churchId, churchSlug }: { churchId: string; churchSlug: string }) {
  const [templateId, setTemplateId] = useState('blank')
  const template = useMemo(() => FLOW_TEMPLATES.find(t => t.id === templateId) ?? FLOW_TEMPLATES[0], [templateId])

  const [name, setName] = useState(template.name === 'Blank Flow' ? '' : template.name)
  const [description, setDescription] = useState(template.description === 'Start from scratch and build your own movement.' ? '' : template.description)
  const [explanation, setExplanation] = useState(template.explanation === 'Use this when you already know the movement you want and just need a clean canvas.' ? '' : template.explanation)
  const [steps, setSteps] = useState<FlowStep[]>(template.steps)
  const [defaultFor, setDefaultFor] = useState<SessionType | ''>('')

  function applyTemplate(id: string) {
    const next = FLOW_TEMPLATES.find(t => t.id === id) ?? FLOW_TEMPLATES[0]
    setTemplateId(id)
    setName(next.name === 'Blank Flow' ? '' : next.name)
    setDescription(next.description === 'Start from scratch and build your own movement.' ? '' : next.description)
    setExplanation(next.explanation === 'Use this when you already know the movement you want and just need a clean canvas.' ? '' : next.explanation)
    setSteps(next.steps.map(step => ({ ...step, id: crypto.randomUUID() })))
  }

  return (
    <form action={createFlowAction} className="space-y-6">
      <input type="hidden" name="churchId" value={churchId} />
      <input type="hidden" name="churchSlug" value={churchSlug} />
      <input type="hidden" name="steps" value={JSON.stringify(steps)} readOnly />
      <input type="hidden" name="name" value={name} readOnly />
      <input type="hidden" name="description" value={description} readOnly />
      <input type="hidden" name="explanation" value={explanation} readOnly />
      <input type="hidden" name="is_default_for" value={defaultFor} readOnly />

      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-slate-900">Create from</h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">Choose a template to prefill the flow, or start blank.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {FLOW_TEMPLATES.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => applyTemplate(option.id)}
              className={`text-left border rounded-2xl p-4 transition-colors ${templateId === option.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="text-sm font-medium text-slate-900">{option.name}</div>
              <div className="text-xs text-slate-500 mt-1">{option.description}</div>
              <div className="flex flex-wrap gap-1.5 mt-3 min-h-[24px]">
                {option.steps.slice(0, 4).map((step, i) => (
                  <span key={step.id ?? i} className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{step.title}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </section>

      <FlowBuilderFields
        name={name}
        description={description}
        explanation={explanation}
        steps={steps}
        defaultFor={defaultFor}
        onNameChange={setName}
        onDescriptionChange={setDescription}
        onExplanationChange={setExplanation}
        onDefaultForChange={setDefaultFor}
        onStepsChange={setSteps}
      />

      <div className="flex items-center gap-3">
        <button type="submit" disabled={!name.trim()} className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50">
          Create flow
        </button>
      </div>
    </form>
  )
}
