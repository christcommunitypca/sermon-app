'use client'

import { useState } from 'react'
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown } from 'lucide-react'
import { FlowBlock, SessionType, BlockType } from '@/types/database'
import { updateFlowAction, deleteFlowAction } from '../../app/(app)/[churchSlug]/flows/actions'

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
  initialStructure: FlowBlock[]
  initialDefaultFor: SessionType | null
}

export function FlowEditor({ flowId, churchSlug, initialName, initialDescription, initialStructure, initialDefaultFor }: Props) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription ?? '')
  const [structure, setStructure] = useState<FlowBlock[]>(initialStructure)
  const [defaultFor, setDefaultFor] = useState<SessionType | ''>(initialDefaultFor ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    const result = await updateFlowAction(flowId, churchSlug, {
      name: name.trim(),
      description: description.trim() || undefined,
      structure,
      is_default_for: (defaultFor as SessionType) || null,
    })
    setSaving(false)
    if (result.error) setError(result.error)
    else { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  function addBlock() {
    setStructure(prev => [...prev, { type: 'point', label: '' }])
  }

  function updateBlock(i: number, updates: Partial<FlowBlock>) {
    setStructure(prev => prev.map((b, idx) => idx === i ? { ...b, ...updates } : b))
  }

  function removeBlock(i: number) {
    setStructure(prev => prev.filter((_, idx) => idx !== i))
  }

  function moveBlock(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= structure.length) return
    const next = [...structure]
    ;[next[i], next[j]] = [next[j], next[i]]
    setStructure(next)
  }

  return (
    <div className="space-y-6">
      {/* Meta */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
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
          <p className="text-xs text-slate-400 mt-1">When set, this flow auto-populates AI generation for matching session types.</p>
        </div>
      </div>

      {/* Block structure */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Block structure</h2>
        <div className="space-y-2 mb-4">
          {structure.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">No blocks yet. Add blocks to define the structure of this flow.</p>
          )}
          {structure.map((block, i) => (
            <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveBlock(i, -1)} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-20">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => moveBlock(i, 1)} disabled={i === structure.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-20">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <select
                value={block.type}
                onChange={e => updateBlock(i, { type: e.target.value as BlockType })}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                {BLOCK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input
                value={block.label}
                onChange={e => updateBlock(i, { label: e.target.value })}
                placeholder="Label (e.g. Introduction)"
                className="flex-1 text-sm bg-transparent border-none focus:outline-none placeholder:text-slate-300"
              />
              <input
                value={block.placeholder ?? ''}
                onChange={e => updateBlock(i, { placeholder: e.target.value || undefined })}
                placeholder="Hint text (optional)"
                className="w-40 text-xs bg-transparent border-none focus:outline-none text-slate-400 placeholder:text-slate-300"
              />
              <button onClick={() => removeBlock(i)} className="text-slate-300 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addBlock}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <Plus className="w-4 h-4" />Add block
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save flow'}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>

        <div>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Delete this flow?</span>
              <button
                onClick={() => deleteFlowAction(flowId, '', churchSlug)}
                className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Yes, delete
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-red-400 hover:text-red-600 transition-colors"
            >
              Delete flow
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
