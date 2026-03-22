'use client'

import { useState } from 'react'
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown } from 'lucide-react'
import { FlowStep, SessionType, BlockType } from '@/types/database'
import { updateFlowAction, archiveFlowAction } from '@/app/(app)/[churchSlug]/flows/actions'

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

interface Props {
  flowId: string
  churchSlug: string
  initialName: string
  initialDescription: string | null
  initialExplanation?: string | null
  initialSteps: FlowStep[]
  initialDefaultFor: SessionType | null
  initialRecommendedFor?: SessionType[]
}

function makeEmptyStep(): FlowStep {
  return {
    id: crypto.randomUUID(),
    title: '',
    prompt_hint: '',
    suggested_block_type: 'point',
  }
}

export function FlowEditor({
  flowId,
  churchSlug,
  initialName,
  initialDescription,
  initialExplanation,
  initialSteps,
  initialDefaultFor,
  initialRecommendedFor = [],
}: Props) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription ?? '')
  const [explanation, setExplanation] = useState(initialExplanation ?? '')
  const [steps, setSteps] = useState<FlowStep[]>(initialSteps?.length ? initialSteps : [makeEmptyStep(), makeEmptyStep(), makeEmptyStep()])
  const [defaultFor, setDefaultFor] = useState<SessionType | ''>(initialDefaultFor ?? '')
  const [recommendedFor, setRecommendedFor] = useState<SessionType[]>(initialRecommendedFor)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  function toggleRecommended(type: SessionType) {
    setRecommendedFor(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    const result = await updateFlowAction(flowId, churchSlug, {
      name: name.trim(),
      description: description.trim() || null,
      explanation: explanation.trim() || null,
      steps,
      recommended_for: recommendedFor,
      is_default_for: (defaultFor as SessionType) || null,
    })
    setSaving(false)
    if (result.error) setError(result.error)
    else {
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    }
  }

  function addStep() {
    setSteps(prev => [...prev, makeEmptyStep()])
  }

  function updateStep(i: number, updates: Partial<FlowStep>) {
    setSteps(prev => prev.map((step, idx) => (idx === i ? { ...step, ...updates } : step)))
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

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Flow name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Short description</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="A quick summary pastors can scan at a glance"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">What this flow means / when to use it</label>
          <textarea
            value={explanation}
            onChange={e => setExplanation(e.target.value)}
            rows={4}
            placeholder="Example: Use this when the text presents a clear burden, then shows how Christ answers it, and ends by calling the church to a lived response."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Default for type</label>
            <select
              value={defaultFor}
              onChange={e => setDefaultFor(e.target.value as SessionType | '')}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">Not a default</option>
              {SESSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-1">Auto-suggest this flow when a new session of that type is created.</p>
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
            <p className="text-sm text-slate-500 mt-1">Shape the sermon movement in order. These step titles feed the outline prompt.</p>
          </div>
          <button
            type="button"
            onClick={addStep}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            <Plus className="w-4 h-4" />Add step
          </button>
        </div>

        <div className="space-y-3">
          {steps.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">No steps yet. Add steps to define the movement of this flow.</p>
          )}

          {steps.map((step, i) => (
            <div key={step.id ?? i} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="pt-2 text-slate-300"><GripVertical className="w-4 h-4" /></div>
                <div className="flex-1 space-y-3">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Step title</label>
                      <input
                        value={step.title}
                        onChange={e => updateStep(i, { title: e.target.value })}
                        placeholder="e.g. Tension, Grace, Response"
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
                        {BLOCK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Prompt hint</label>
                    <input
                      value={step.prompt_hint ?? ''}
                      onChange={e => updateStep(i, { prompt_hint: e.target.value || null })}
                      placeholder="Optional: tell the AI what this step should accomplish"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 disabled:opacity-30">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 disabled:opacity-30">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => removeStep(i)} className="p-2 rounded-lg border border-red-200 bg-white text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save flow'}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>

        <div>
          {confirmArchive ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Archive this flow?</span>
              <button
                onClick={() => archiveFlowAction(flowId, churchSlug)}
                className="px-3 py-1.5 text-xs font-medium bg-stone-700 text-white rounded-lg hover:bg-stone-800 transition-colors"
              >
                Yes, archive
              </button>
              <button type="button" onClick={() => setConfirmArchive(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              Archive flow
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
