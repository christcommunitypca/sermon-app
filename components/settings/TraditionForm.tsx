'use client'

import { useState } from 'react'
import { TRADITION_LABELS, TheologicalTradition } from '@/types/database'
import { updateTraditionAction } from '@/app/(app)/[churchSlug]/teaching/[sessionId]/research-actions'

interface Props {
  userId: string
  currentTradition: string | null
}

export function TraditionForm({ userId, currentTradition }: Props) {
  const [tradition, setTradition] = useState<string>(currentTradition ?? 'nondenominational')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)

    const result = await updateTraditionAction(userId, tradition)
    setSaving(false)

    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Theological tradition</label>
        <p className="text-xs text-slate-400 mb-3">
          This shapes how AI research is framed — interpretive perspectives, theological emphasis, and
          which liturgical observances are highlighted in series planning.
        </p>
        <select
          value={tradition}
          onChange={e => setTradition(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          {Object.entries(TRADITION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 space-y-1">
        <p className="font-medium text-slate-800">How this is used:</p>
        <ul className="list-disc list-inside space-y-1 text-xs text-slate-500">
          <li>Theological research panels are framed from your tradition's perspective</li>
          <li>Cross-tradition insights are still shown but clearly labeled</li>
          <li>Series planning flags liturgical observances relevant to your tradition</li>
          <li>AI outline generation is tradition-aware in tone and emphasis</li>
        </ul>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save tradition'}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  )
}
