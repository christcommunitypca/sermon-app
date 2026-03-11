'use client'

import { useState } from 'react'
import { X, Sparkles, ClipboardCopy, Check, Loader2, Clock, BookMarked } from 'lucide-react'
import {
  generateLessonSummaryAction,
  getLessonSummaryPromptAction,
} from '@/app/actions/verse-study'
import type { OutlineBlock } from '@/types/database'

interface Props {
  sessionId: string
  blocks: OutlineBlock[]
  onClose: () => void
}

interface SummaryResult {
  estimated_minutes: number
  key_theme: string
  titles: string[]
}

export function LessonSummaryModal({ sessionId, blocks, onClose }: Props) {
  const [result, setResult] = useState<SummaryResult | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyingPrompt, setCopyingPrompt] = useState(false)
  const [copiedTitles, setCopiedTitles] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    const data = await generateLessonSummaryAction(sessionId, blocks)
    setGenerating(false)
    if (data.error) {
      setError(data.error)
    } else {
      setResult({
        estimated_minutes: data.estimated_minutes ?? 0,
        key_theme: data.key_theme ?? '',
        titles: data.titles,
      })
    }
  }

  async function handleCopyPrompt() {
    setCopyingPrompt(true)
    const data = await getLessonSummaryPromptAction(sessionId, blocks)
    setCopyingPrompt(false)
    if (data.error || !data.prompt) {
      setError(data.error ?? 'Failed to build prompt')
      return
    }
    await navigator.clipboard.writeText(data.prompt)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2500)
  }

  async function handleCopyTitles() {
    if (!result?.titles.length) return
    const text = result.titles.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')
    await navigator.clipboard.writeText(text)
    setCopiedTitles(true)
    setTimeout(() => setCopiedTitles(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-900">Lesson Summary</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating || blocks.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 disabled:opacity-40 transition-colors"
            >
              {generating
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Sparkles className="w-4 h-4" />}
              {generating ? 'Generating…' : result ? 'Regenerate' : 'Generate'}
            </button>
            <button
              onClick={handleCopyPrompt}
              disabled={copyingPrompt || blocks.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              {copyingPrompt
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : copiedPrompt
                  ? <Check className="w-4 h-4 text-emerald-600" />
                  : <ClipboardCopy className="w-4 h-4" />}
              {copiedPrompt ? 'Copied!' : 'Copy prompt'}
            </button>
          </div>

          {blocks.length === 0 && (
            <p className="text-xs text-slate-400">Build your outline first to generate a summary.</p>
          )}

          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-5">
              {/* Time estimate */}
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl">
                <Clock className="w-5 h-5 text-slate-400 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-slate-500">Estimated delivery time</p>
                  <p className="text-2xl font-bold text-slate-900">{result.estimated_minutes} min</p>
                </div>
              </div>

              {/* Key theme */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Key Theme</p>
                <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                  {result.key_theme}
                </p>
              </div>

              {/* Titles */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Title Suggestions</p>
                  <button
                    onClick={handleCopyTitles}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    {copiedTitles
                      ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</>
                      : <><ClipboardCopy className="w-3.5 h-3.5" /> Copy all</>}
                  </button>
                </div>
                <div className="space-y-1">
                  {result.titles.map((title: string, i: number) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 px-4 py-2.5 bg-white border border-slate-100 rounded-xl hover:border-slate-200 transition-colors"
                    >
                      <span className="text-xs font-mono text-slate-300 mt-0.5 w-5 shrink-0">{i + 1}</span>
                      <span className="text-sm text-slate-700">{title}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
