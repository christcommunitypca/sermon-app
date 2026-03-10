'use client'

import { useState, useRef } from 'react'
import { Mic, Type, Trash2, Upload, FileAudio, Plus } from 'lucide-react'
import { ThoughtCapture as ThoughtCaptureType } from '@/types/database'
import { addTextThoughtAction, deleteThoughtAction } from '@/app/(app)/[churchSlug]/teaching/[sessionId]/thought-actions'
import { getStorageClient } from '@/lib/supabase/storage-client'

interface Props {
  sessionId: string
  churchId: string
  churchSlug: string
  initialThoughts: ThoughtCaptureType[]
}

export function ThoughtCapture({ sessionId, churchId, churchSlug, initialThoughts }: Props) {
  const [thoughts, setThoughts] = useState(initialThoughts)
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleAddText() {
    if (!text.trim()) return
    setAdding(true)
    setError(null)

    const result = await addTextThoughtAction(sessionId, churchId, churchSlug, text.trim())
    if (result.error) {
      setError(result.error)
    } else {
      // Optimistic: add a local version
      setThoughts(prev => [{
        id: `local-${Date.now()}`,
        session_id: sessionId,
        church_id: churchId,
        type: 'text',
        content: text.trim(),
        storage_path: null,
        file_name: null,
        file_size_bytes: null,
        duration_seconds: null,
        transcription_status: 'none',
        created_at: new Date().toISOString(),
      }, ...prev])
      setText('')
    }
    setAdding(false)
  }

  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    const path = `thoughts/${sessionId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await getStorageClient().storage
      .from('thought-captures')
      .upload(path, file)

    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }

    const { addAudioThoughtAction } = await import('@/app/(app)/[churchSlug]/teaching/[sessionId]/thought-actions')
    const result = await addAudioThoughtAction(
      sessionId, churchId, path, file.name, file.size, null
    )

    if (result.error) {
      setError(result.error)
    } else {
      setThoughts(prev => [{
        id: `local-${Date.now()}`,
        session_id: sessionId,
        church_id: churchId,
        type: 'audio',
        content: null,
        storage_path: path,
        file_name: file.name,
        file_size_bytes: file.size,
        duration_seconds: null,
        transcription_status: 'none',
        created_at: new Date().toISOString(),
      }, ...prev])
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete(id: string) {
    const result = await deleteThoughtAction(id, sessionId, churchSlug)
    if (!result.error) {
      setThoughts(prev => prev.filter(t => t.id !== id))
    }
  }

  return (
    <div className="space-y-4">
      {/* Text input */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddText()
            }}
            placeholder="Capture a thought, illustration, or idea…"
            rows={3}
            className="flex-1 text-sm border-none bg-transparent focus:outline-none resize-none placeholder:text-slate-300"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Uploading…' : 'Upload audio'}
            </button>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
          </div>
          <button
            onClick={handleAddText}
            disabled={!text.trim() || adding}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {adding ? 'Adding…' : 'Add thought'}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Thought list */}
      <div className="space-y-2">
        {thoughts.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            No thoughts captured yet. Add a text note or upload an audio recording.
          </p>
        ) : (
          thoughts.map(thought => (
            <div key={thought.id} className="flex items-start gap-3 bg-white border border-slate-100 rounded-xl p-4">
              <div className="shrink-0 mt-0.5">
                {thought.type === 'text'
                  ? <Type className="w-4 h-4 text-slate-300" />
                  : <FileAudio className="w-4 h-4 text-blue-300" />
                }
              </div>
              <div className="flex-1 min-w-0">
                {thought.type === 'text' ? (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{thought.content}</p>
                ) : (
                  <div>
                    <p className="text-sm text-slate-700">{thought.file_name}</p>
                    {thought.file_size_bytes && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {(thought.file_size_bytes / 1024 / 1024).toFixed(1)} MB
                        {' · '}
                        <span className="italic">Transcription: deferred</span>
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs text-slate-300 mt-1">
                  {new Date(thought.created_at).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => handleDelete(thought.id)}
                className="shrink-0 p-1 text-slate-300 hover:text-red-500 transition-colors rounded"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
