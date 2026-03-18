'use client'

import { useState, useRef } from 'react'
import { getStorageClient } from '@/lib/supabase/storage-client'
import { updateProfileAction } from '@/app/actions/auth'
import { Profile } from '@/types/database'
import { Camera } from 'lucide-react'

interface Props {
  initialProfile: Profile | null
  userId: string
}

export function ProfileForm({ initialProfile, userId }: Props) {
  const [fullName, setFullName] = useState(initialProfile?.full_name ?? '')
  const [bio, setBio] = useState(initialProfile?.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(initialProfile?.avatar_url ?? '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `avatars/${userId}.${ext}`

    const { error } = await getStorageClient().storage
      .from('user-assets')
      .upload(path, file, { upsert: true })

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      const { data: { publicUrl } } = getStorageClient().storage.from('user-assets').getPublicUrl(path)
      setAvatarUrl(publicUrl)
    }
    setUploading(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const { error } = await updateProfileAction({
      userId,
      fullName: fullName.trim() || null,
      bio: bio.trim() || null,
      avatarUrl: avatarUrl || null,
    })

    setMessage(error
      ? { type: 'error', text: error }
      : { type: 'success', text: 'Profile saved.' }
    )
    setSaving(false)
  }

  const initials = fullName.trim()
    ? fullName.trim().split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative group w-16 h-16 rounded-full overflow-hidden bg-slate-200 shrink-0"
          aria-label="Change avatar"
        >
          {avatarUrl
            ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            : <span className="flex items-center justify-center w-full h-full text-slate-600 font-medium text-lg">{initials}</span>
          }
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Camera className="w-5 h-5 text-white" />
          </div>
        </button>
        <div>
          <p className="text-sm font-medium text-slate-700">{uploading ? 'Uploading…' : 'Profile photo'}</p>
          <p className="text-xs text-slate-400">JPG or PNG. Max 2MB.</p>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Full name</label>
        <input
          type="text"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          placeholder="Your name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Bio</label>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
          placeholder="Brief bio visible to church members"
        />
      </div>

      {message && (
        <p className={`text-sm ${message.type === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  )
}
