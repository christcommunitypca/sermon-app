'use client'

import { useState } from 'react'

export function ChurchInviteForm() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'teacher'>('teacher')

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
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Role in this church</label>
        <select
          name="role"
          value={role}
          onChange={e => setRole(e.target.value as 'admin' | 'teacher')}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="teacher">Church User</option>
          <option value="admin">Church Admin</option>
        </select>
      </div>
    </>
  )
}
