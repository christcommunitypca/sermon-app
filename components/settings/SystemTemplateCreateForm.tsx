'use client'

import { useMemo, useState } from 'react'

type Step = { id: string; title: string; prompt_hint?: string | null; suggested_block_type?: string | null }

type TemplatePreset = {
  key: string
  name: string
  description: string
  explanation: string
  tradition_tags: string[]
  style_tags: string[]
  influenced_by: string[]
  recommended_for: string[]
  steps: Step[]
}

export function SystemTemplateCreateForm({ presets }: { presets: TemplatePreset[] }) {
  const [selectedKey, setSelectedKey] = useState(presets[0]?.key ?? 'blank')
  const current = useMemo(() => presets.find(p => p.key === selectedKey) ?? presets[0], [presets, selectedKey])

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Start from a pattern</label>
        <div className="grid gap-2 md:grid-cols-2">
          {presets.map(preset => (
            <button
              key={preset.key}
              type="button"
              onClick={() => setSelectedKey(preset.key)}
              className={`text-left border rounded-xl p-3 ${selectedKey === preset.key ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
            >
              <div className="font-medium text-slate-900">{preset.name}</div>
              <div className="text-xs text-slate-500 mt-1">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      <input type="hidden" name="steps" value={JSON.stringify(current?.steps ?? [])} />
      <input type="hidden" name="tradition_tags" value={JSON.stringify(current?.tradition_tags ?? [])} />
      <input type="hidden" name="style_tags" value={JSON.stringify(current?.style_tags ?? [])} />
      <input type="hidden" name="influenced_by" value={JSON.stringify(current?.influenced_by ?? [])} />
      <input type="hidden" name="recommended_for" value={JSON.stringify(current?.recommended_for ?? [])} />

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Template name</label>
        <input name="name" defaultValue={current?.name ?? ''} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Short description</label>
        <input name="description" defaultValue={current?.description ?? ''} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">When to use it</label>
        <textarea name="explanation" defaultValue={current?.explanation ?? ''} rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
      </div>
    </>
  )
}
