'use client'

import { useMemo, useState } from 'react'

export function SystemInviteForm({ churches }: { churches: Array<{ id: string; name: string; slug: string }> }) {
  const [email, setEmail] = useState('')
  const [assignSystemAdmin, setAssignSystemAdmin] = useState(false)
  const [selected, setSelected] = useState<Record<string, 'admin' | 'teacher' | ''>>({})

  const assignmentJson = useMemo(() => {
    const rows = Object.entries(selected)
      .filter(([, role]) => role)
      .map(([churchId, role]) => ({ churchId, role }))
    return JSON.stringify(rows)
  }, [selected])

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          name="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          placeholder="name@example.com"
          required
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="assignSystemAdmin"
          checked={assignSystemAdmin}
          onChange={e => setAssignSystemAdmin(e.target.checked)}
        />
        Also grant System Admin access
      </label>

      <input type="hidden" name="assignments" value={assignmentJson} />

      <div>
        <div className="text-sm font-medium text-slate-700 mb-2">Church assignments</div>
        <div className="space-y-2">
          {churches.map(church => (
            <div key={church.id} className="flex items-center gap-3 border border-slate-200 rounded-lg p-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900">{church.name}</div>
                <div className="text-xs text-slate-400">/{church.slug}</div>
              </div>
              <select
                value={selected[church.id] ?? ''}
                onChange={e => setSelected(prev => ({ ...prev, [church.id]: e.target.value as 'admin' | 'teacher' | '' }))}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="">No access</option>
                <option value="teacher">Church User</option>
                <option value="admin">Church Admin</option>
              </select>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
