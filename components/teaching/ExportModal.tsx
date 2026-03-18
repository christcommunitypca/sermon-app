'use client'
// ── components/teaching/ExportModal.tsx ──────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { X, Copy, Check, FileText, Loader2, ExternalLink, AlertCircle } from 'lucide-react'
import type { OutlineBlock } from '@/types/database'
import {
  formatOutlineAsText,
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_TYPE_LABELS,
  type ExportOptions,
  type BlockTypeKey,
} from '@/lib/export-outline'
import { createGoogleDocAction } from '@/app/actions/google-docs'

const PREFS_KEY = 'outline-export-prefs'
const BLOCK_TYPE_ORDER: BlockTypeKey[] = [
  'point', 'sub_point', 'scripture', 'illustration', 'application', 'transition',
]

interface Props {
  blocks:       OutlineBlock[]
  sessionTitle: string
  scriptureRef: string | null
  scheduledDate: string | null
  onClose:      () => void
  onBeforeExport?: () => Promise<void> | void
}

export function ExportModal({ blocks, sessionTitle, scriptureRef, scheduledDate, onClose, onBeforeExport }: Props) {
  const [tab,        setTab]        = useState<'copy' | 'gdocs'>('copy')
  const [opts,       setOpts]       = useState<ExportOptions>(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY)
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    return DEFAULT_EXPORT_OPTIONS
  })
  const [copied,     setCopied]     = useState(false)
  const [docsState,  setDocsState]  = useState<'idle' | 'creating' | 'done' | 'needs_auth' | 'error'>('idle')
  const [docUrl,     setDocUrl]     = useState<string | null>(null)
  const [docsError,  setDocsError]  = useState<string | null>(null)

  // Persist prefs
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(opts)) } catch { /* ignore */ }
  }, [opts])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const toggleType = useCallback((type: BlockTypeKey) => {
    setOpts((prev: ExportOptions) => ({
      ...prev,
      includeTypes: { ...prev.includeTypes, [type]: !prev.includeTypes[type] },
    }))
  }, [])

  const previewText = formatOutlineAsText(blocks, opts)

  const dateStr = scheduledDate
    ? new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : null

  async function handleCopy() {
    await navigator.clipboard.writeText(previewText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleCreateDoc() {
    await onBeforeExport?.()
  
    setDocsState('creating')
    setDocsError(null)
    const result = await createGoogleDocAction({
      blocks, opts,
      title: sessionTitle,
      scriptureRef,
      dateStr,
    })
    if ('error' in result) {
      if (result.error === 'NO_GOOGLE_TOKEN') {
        setDocsState('needs_auth')
      } else {
        setDocsError(result.error)
        setDocsState('error')
      }
    } else {
      setDocUrl(result.docUrl)
      setDocsState('done')
      window.open(result.docUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const hasContent = previewText.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-sm font-semibold text-slate-900">Export Outline</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CATEGORIES */}
        <div className="flex gap-1 px-5 pt-3 shrink-0">
          <button
            onClick={() => setTab('copy')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'copy' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Copy className="w-3 h-3 inline mr-1.5" />Copy
          </button>
          <button
            onClick={() => setTab('gdocs')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'gdocs' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-3 h-3 inline mr-1.5" />Google Docs
          </button>
        </div>

        {/* Shared: include toggles */}
        <div className="px-5 pt-4 shrink-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Include</p>
          <div className="flex flex-wrap gap-2">
            {BLOCK_TYPE_ORDER.map(type => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  opts.includeTypes[type]
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                }`}
              >
                {EXPORT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {tab === 'copy' && (
          <>
            {/* Live preview */}
            <div className="flex-1 overflow-y-auto px-5 pt-4 pb-2 min-h-0">
              {hasContent ? (
                <pre className="text-xs text-slate-600 font-mono leading-relaxed whitespace-pre-wrap bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                  {previewText}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-24 text-slate-300 text-sm">
                  Nothing selected to export
                </div>
              )}
            </div>

            {/* Copy button */}
            <div className="px-5 py-4 border-t border-slate-100 shrink-0">
              <button
                onClick={handleCopy}
                disabled={!hasContent}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 disabled:opacity-40 transition-colors"
              >
                {copied
                  ? <><Check className="w-4 h-4" />Copied!</>
                  : <><Copy className="w-4 h-4" />Copy to clipboard</>}
              </button>
            </div>
          </>
        )}

        {tab === 'gdocs' && (
          <div className="flex-1 flex flex-col px-5 pt-4 pb-5 gap-4 min-h-0">
            {/* Doc preview info */}
            <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100 text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700">{sessionTitle}</p>
              {(scriptureRef || dateStr) && (
                <p>{[scriptureRef, dateStr].filter(Boolean).join('  ·  ')}</p>
              )}
              <p className="text-slate-400 mt-1">
                {BLOCK_TYPE_ORDER.filter(t => opts.includeTypes[t]).map(t => EXPORT_TYPE_LABELS[t]).join(', ')}
              </p>
            </div>

            {/* State messages */}
            {docsState === 'needs_auth' && (
              <div className="flex items-start gap-2.5 px-3 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <div>
                  <p className="font-semibold mb-1">Google Docs access needed</p>
                  <p className="text-amber-700">Sign out and sign back in with Google to grant Docs permission. Your existing data is unaffected.</p>
                  <a href="/settings/integrations" className="inline-block mt-2 text-amber-800 underline hover:text-amber-900"> Re-connect Google → </a>
                </div>
              </div>
            )}
            {docsState === 'error' && docsError && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {docsError}
              </div>
            )}
            {docsState === 'done' && docUrl && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                <Check className="w-4 h-4 shrink-0 text-emerald-500" />
                <div className="flex-1">Document created successfully</div>
                <a href={docUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 font-medium hover:underline">
                  Open <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            <div className="mt-auto">
              <button
                onClick={handleCreateDoc}
                disabled={!hasContent || docsState === 'creating'}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 disabled:opacity-40 transition-colors"
              >
                {docsState === 'creating'
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Creating…</>
                  : <><FileText className="w-4 h-4" />Create in Google Docs</>}
              </button>
              <p className="text-center text-[11px] text-slate-400 mt-2">
                Opens in a new tab · saves to your Drive
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
