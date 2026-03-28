'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FlowStep, SessionType } from '@/types/database'
import { createFlowAction } from '@/app/(app)/[churchSlug]/flows/actions'
import { FlowBuilderFields } from '@/components/flows/FlowBuilderFields'
import { FLOW_TEMPLATES } from '@/lib/flow-templates'

type TemplateOption = {
  id: string
  name: string
  description: string | null
  explanation: string | null
  steps: FlowStep[]
  source?: 'blank' | 'system' | 'local'
}

const BLANK_DESCRIPTION = 'Start from scratch and build your own movement.'
const BLANK_EXPLANATION = 'Use this when you already know the movement you want and just need a clean canvas.'

function normalizeSteps(steps: Array<{ id?: string; title: string; prompt_hint?: string | null; suggested_block_type?: FlowStep['suggested_block_type'] | null }>): FlowStep[] {
  return steps.map((step, index) => ({
    id: step.id ?? `step-${index + 1}`,
    title: step.title,
    prompt_hint: step.prompt_hint ?? null,
    suggested_block_type: step.suggested_block_type ?? null,
  }))
}

function toLocalTemplateOptions(): TemplateOption[] {
  return FLOW_TEMPLATES.map(template => ({
    id: `local:${template.id}`,
    name: template.name,
    description: template.description,
    explanation: template.explanation,
    steps: normalizeSteps(template.steps),
    source: template.id === 'blank' ? 'blank' : 'local',
  }))
}

export function FlowCreateForm({
  churchId,
  churchSlug,
  templates = [],
}: {
  churchId: string
  churchSlug: string
  templates?: TemplateOption[]
}) {
  const templateOptions = useMemo<TemplateOption[]>(() => {
    const blank: TemplateOption = {
      id: 'blank',
      name: 'Blank Flow',
      description: BLANK_DESCRIPTION,
      explanation: BLANK_EXPLANATION,
      steps: [],
      source: 'blank',
    }

    const systemTemplates = templates.map(template => ({
      ...template,
      description: template.description ?? '',
      explanation: template.explanation ?? '',
      steps: normalizeSteps(template.steps),
      source: template.source ?? 'system',
    }))

    if (systemTemplates.length > 0) return [blank, ...systemTemplates]

    const localTemplates = toLocalTemplateOptions().filter(template => template.id !== 'local:blank')
    return [blank, ...localTemplates]
  }, [templates])

  const defaultTemplate = templateOptions[0]
  const [templateId, setTemplateId] = useState(defaultTemplate.id)
  const template = useMemo(
    () => templateOptions.find(option => option.id === templateId) ?? defaultTemplate,
    [templateId, templateOptions, defaultTemplate]
  )

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [explanation, setExplanation] = useState('')
  const [steps, setSteps] = useState<FlowStep[]>([])
  const [defaultFor, setDefaultFor] = useState<SessionType | ''>('')

  useEffect(() => {
    if (!templateOptions.some(option => option.id === templateId)) {
      setTemplateId(defaultTemplate.id)
    }
  }, [templateId, templateOptions, defaultTemplate.id])

  function applyTemplate(id: string) {
    const next = templateOptions.find(option => option.id === id) ?? defaultTemplate
    setTemplateId(next.id)
    setName(next.source === 'blank' ? '' : next.name)
    setDescription(next.source === 'blank' ? '' : (next.description ?? ''))
    setExplanation(next.source === 'blank' ? '' : (next.explanation ?? ''))
    setSteps(next.steps.map(step => ({ ...step, id: crypto.randomUUID() })))
  }

  function sourceLabel(option: TemplateOption) {
    if (option.source === 'system') return 'System template'
    if (option.source === 'local') return 'Starter template'
    return 'Blank'
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
        <p className="text-xs text-slate-500 mt-1 mb-4">Start blank or use a system template as your first draft.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templateOptions.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => applyTemplate(option.id)}
              className={`text-left border rounded-2xl p-4 transition-colors ${templateId === option.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium text-slate-900">{option.name}</div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {sourceLabel(option)}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1">{option.description || 'No description yet.'}</div>
              <div className="flex flex-wrap gap-1.5 mt-3 min-h-[24px]">
                {option.steps.length ? option.steps.slice(0, 4).map((step, i) => (
                  <span key={step.id ?? i} className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{step.title}</span>
                )) : (
                  <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">Start empty</span>
                )}
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
