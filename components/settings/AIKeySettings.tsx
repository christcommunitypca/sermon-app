'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, Clock, AlertCircle, Eye, EyeOff, Trash2 } from 'lucide-react'

type StatusType = 'not_set' | 'untested' | 'valid' | 'invalid' | 'expired'

type KeyStatusData = {
  validation_status: StatusType
  validated_at: string | null
  validation_error: string | null
  model_preference: string
  updated_at: string
} | null

interface Props {
  initialStatus: KeyStatusData
  userId: string
}

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o (recommended)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (faster, lower cost)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
]

export function AIKeySettings({ initialStatus, userId }: Props) {
  const [status, setStatus] = useState<KeyStatusData>(initialStatus)
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [modelPref, setModelPref] = useState(initialStatus?.model_preference ?? 'gpt-4o')
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentStatus: StatusType = status
    ? status.validation_status
    : 'not_set'

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!keyInput.trim()) return
    setSaving(true)
    setError(null)

    const res = await fetch('/api/settings/ai-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: keyInput.trim(), modelPreference: modelPref }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to save key')
    } else {
      setStatus(data.status)
      setKeyInput('')
    }
    setSaving(false)
  }

  async function handleValidate() {
    setValidating(true)
    setError(null)
    const res = await fetch('/api/settings/ai-key/validate', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Validation failed')
    } else {
      setStatus(prev => prev ? { ...prev, ...data.status } : null)
    }
    setValidating(false)
  }

  async function handleRemove() {
    setRemoving(true)
    await fetch('/api/settings/ai-key', { method: 'DELETE' })
    setStatus(null)
    setConfirmRemove(false)
    setRemoving(false)
  }

  return (
    <div className="space-y-8">
      {/* Status indicator */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">API Key Status</h2>
          {currentStatus !== 'not_set' && currentStatus !== 'untested' && (
            <button
              onClick={handleValidate}
              disabled={validating}
              className="text-xs text-slate-500 hover:text-slate-800 underline disabled:opacity-50"
            >
              {validating ? 'Validating…' : 'Validate now'}
            </button>
          )}
        </div>

        <div className="mt-3">
          <StatusDisplay status={currentStatus} validatedAt={status?.validated_at ?? null} error={status?.validation_error ?? null} />
        </div>

        {currentStatus === 'untested' && (
          <div className="mt-3">
            <button
              onClick={handleValidate}
              disabled={validating}
              className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {validating ? 'Validating…' : 'Validate key'}
            </button>
          </div>
        )}
      </div>

      {/* Save / update key form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-medium text-slate-700 mb-4">
          {currentStatus === 'not_set' ? 'Add API Key' : 'Update API Key'}
        </h2>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="api-key" className="block text-xs font-medium text-slate-600 mb-1.5">
              OpenAI API Key
            </label>
            <div className="relative">
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="sk-proj-..."
                className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Get your key at platform.openai.com/api-keys. The key is encrypted before storage.
            </p>
          </div>

          <div>
            <label htmlFor="model" className="block text-xs font-medium text-slate-600 mb-1.5">
              Default Model
            </label>
            <select
              id="model"
              value={modelPref}
              onChange={e => setModelPref(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              {MODEL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={!keyInput.trim() || saving}
            className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving & validating…' : 'Save key'}
          </button>
        </form>
      </div>

      {/* Remove key */}
      {currentStatus !== 'not_set' && (
        <div className="bg-white border border-red-100 rounded-xl p-5">
          <h2 className="text-sm font-medium text-slate-700 mb-1">Remove API Key</h2>
          <p className="text-xs text-slate-500 mb-3">
            Removing the key will disable all AI features until a new key is added.
          </p>

          {confirmRemove ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handleRemove}
                disabled={removing}
                className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {removing ? 'Removing…' : 'Yes, remove key'}
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove key
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── StatusDisplay ─────────────────────────────────────────────────────────────
function StatusDisplay({
  status, validatedAt, error,
}: {
  status: StatusType
  validatedAt: string | null
  error: string | null
}) {
  if (status === 'not_set') {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <AlertCircle className="w-4 h-4" />
        No API key saved
      </div>
    )
  }

  if (status === 'untested') {
    return (
      <div className="flex items-center gap-2 text-sm text-amber-600">
        <Clock className="w-4 h-4" />
        Key saved — not yet validated
      </div>
    )
  }

  if (status === 'valid') {
    const when = validatedAt ? new Date(validatedAt).toLocaleDateString() : null
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="w-4 h-4" />
        Valid
        {when && <span className="text-xs text-slate-400 ml-1">Validated {when}</span>}
      </div>
    )
  }

  // invalid or expired
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-red-600">
        <XCircle className="w-4 h-4" />
        {status === 'expired' ? 'Key expired' : 'Invalid key'}
      </div>
      {error && (
        <p className="text-xs text-slate-500 mt-1 ml-6">{error}</p>
      )}
    </div>
  )
}