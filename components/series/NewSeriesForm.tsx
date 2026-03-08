'use client'

import { useState } from 'react'
import { ChevronLeft, Sparkles, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { SeriesPlanner } from '@/components/series/SeriesPlanner'
import { ProposedWeek } from '@/types/database'

interface FormState {
  title: string
  description: string
  scriptureSection: string
  totalWeeks: string
  startDate: string
}

interface Props {
  churchId: string
  churchSlug: string
  hasValidAIKey: boolean
  tradition: string
}

export function NewSeriesForm({ churchId, churchSlug, hasValidAIKey, tradition }: Props) {
  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    scriptureSection: '',
    totalWeeks: '6',
    startDate: '',
  })
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposedWeeks, setProposedWeeks] = useState<ProposedWeek[] | null>(null)
  const [observances, setObservances] = useState<any[]>([])

  const canGenerate = form.title.trim() && form.scriptureSection.trim() && parseInt(form.totalWeeks) > 0

  function set(key: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleGenerate() {
    if (!canGenerate) return
    setGenerating(true)
    setError(null)

    // Compute liturgical observances on the client side (pure computation)
    if (form.startDate) {
      const { matchObservancesToWeeks } = await import('@/lib/liturgical')
      const obs = matchObservancesToWeeks(new Date(form.startDate), parseInt(form.totalWeeks), tradition)
      setObservances(obs)
    }

    const res = await fetch('/api/ai/series', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        scriptureSection: form.scriptureSection,
        totalWeeks: parseInt(form.totalWeeks),
        startDate: form.startDate || null,
        description: form.description || null,
      }),
    })

    const data = await res.json()
    setGenerating(false)

    if (!res.ok || data.error) {
      setError(data.error ?? 'Generation failed')
    } else {
      setProposedWeeks(data.weeks)
    }
  }

  if (proposedWeeks) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => setProposedWeeks(null)}
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />Edit series details
        </button>
        <h1 className="text-2xl font-bold text-slate-900 mb-8">Review plan</h1>
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <SeriesPlanner
            churchId={churchId}
            churchSlug={churchSlug}
            formData={{
              title: form.title,
              description: form.description,
              scriptureSection: form.scriptureSection,
              totalWeeks: parseInt(form.totalWeeks),
              startDate: form.startDate,
            }}
            initialWeeks={proposedWeeks}
            observances={observances}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/series`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />Series
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-8">New series</h1>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Series title</label>
          <input
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="e.g. The Gospel of John"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description (optional)</label>
          <input
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Brief description of the series"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Scripture section</label>
          <input
            value={form.scriptureSection}
            onChange={e => set('scriptureSection', e.target.value)}
            placeholder="e.g. Romans 1-8 or Mark 1-6"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <p className="text-xs text-slate-400 mt-1">The full passage range for the entire series</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Number of weeks</label>
            <input
              type="number"
              min="2"
              max="52"
              value={form.totalWeeks}
              onChange={e => set('totalWeeks', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start date (optional)</label>
            <input
              type="date"
              value={form.startDate}
              onChange={e => set('startDate', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
        </div>

        {form.startDate && (
          <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs text-amber-800 font-medium">Liturgical calendar will be checked</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Based on your theological tradition, AI will flag weeks that coincide with significant observances.
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {!hasValidAIKey && (
          <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
            Add an AI key in{' '}
            <a href={`/${churchSlug}/settings/ai`} className="text-violet-600 hover:underline">
              Settings → AI
            </a>{' '}
            to generate a series plan automatically.
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          {hasValidAIKey ? (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              {generating ? 'Planning…' : 'Generate plan'}
            </button>
          ) : (
            <button disabled className="px-5 py-2.5 bg-slate-200 text-slate-400 text-sm font-medium rounded-lg cursor-not-allowed">
              Generate plan
            </button>
          )}
          {generating && (
            <span className="text-xs text-slate-400 animate-pulse">Generating {form.totalWeeks}-week plan…</span>
          )}
        </div>
      </div>
    </div>
  )
}
