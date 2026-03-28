'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { archiveFlowAction, updateFlowAction } from '@/app/(app)/[churchSlug]/flows/actions'
import { FlowBuilderFields } from '@/components/flows/FlowBuilderFields'
import type { FlowStep, SessionType } from '@/types/database'

interface Props {
  flowId: string
  churchSlug: string
  initialName: string
  initialDescription: string | null
  initialExplanation?: string | null
  initialSteps: FlowStep[]
  initialDefaultFor: SessionType | null
}

export function FlowEditor({
  flowId,
  churchSlug,
  initialName,
  initialDescription,
  initialExplanation,
  initialSteps,
  initialDefaultFor,
}: Props) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription ?? '')
  const [explanation, setExplanation] = useState(initialExplanation ?? '')
  const [steps, setSteps] = useState<FlowStep[]>(initialSteps)
  const [defaultFor, setDefaultFor] = useState<SessionType | ''>(initialDefaultFor ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    const result = await updateFlowAction(flowId, churchSlug, {
      name: name.trim(),
      description: description.trim() || null,
      explanation: explanation.trim() || null,
      steps,
      is_default_for: (defaultFor as SessionType) || null,
    })
    setSaving(false)
    if (result.error) setError(result.error)
    else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  async function handleArchive() {
    setError(null)
    const result = await archiveFlowAction(flowId, churchSlug)
    if (result.error) {
      setError(result.error)
      return
    }
    router.push(`/${churchSlug}/flows?scope=${result.scope ?? 'personal'}`)
    router.refresh()
  }

  return (
    <div className="space-y-6">
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

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={!name.trim() || saving} className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50">
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save flow'}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
        <button onClick={handleArchive} className="text-sm text-slate-500 hover:text-slate-800">
          Archive flow
        </button>
      </div>
    </div>
  )
}
