'use client'

import { useState } from 'react'
import { Notification } from '@/types/database'
import { Bell } from 'lucide-react'

interface Props {
  notifications: Notification[]
  emailEnabled: boolean
  churchSlug: string
  churchId: string
  userId: string
}

export function NotificationList({ notifications: initial, emailEnabled: initEmail, churchId, userId }: Props) {
  const [notifications, setNotifications] = useState(initial)
  const [emailEnabled, setEmailEnabled] = useState(initEmail)
  const [markingAll, setMarkingAll] = useState(false)

  const unread = notifications.filter(n => !n.read_at)

  async function markAllRead() {
    setMarkingAll(true)
    await fetch('/api/notifications/read-all', { method: 'POST' })
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    setMarkingAll(false)
  }

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
  }

  async function toggleEmail() {
    const next = !emailEnabled
    setEmailEnabled(next)
    await fetch('/api/notifications/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ churchId, userId, emailEnabled: next }),
    })
  }

  return (
    <div className="space-y-6">
      {/* Email preference */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">Email notifications</p>
          <p className="text-xs text-slate-400 mt-0.5">Receive important updates by email</p>
        </div>
        <button
          onClick={toggleEmail}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            emailEnabled ? 'bg-slate-900' : 'bg-slate-200'
          }`}
          role="switch"
          aria-checked={emailEnabled}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            emailEnabled ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {/* Notification list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-slate-700">
            {unread.length > 0 ? `${unread.length} unread` : 'All caught up'}
          </h2>
          {unread.length > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              className="text-xs text-slate-400 hover:text-slate-700 underline disabled:opacity-50"
            >
              Mark all read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Bell className="w-8 h-8 mb-3 opacity-30" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {notifications.map(n => (
              <div
                key={n.id}
                onClick={() => !n.read_at && markRead(n.id)}
                className={`px-4 py-3 rounded-xl border transition-colors cursor-pointer ${
                  n.read_at
                    ? 'bg-white border-slate-100 text-slate-500'
                    : 'bg-blue-50 border-blue-100 text-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${n.read_at ? 'text-slate-600' : 'text-slate-900'}`}>
                      {n.title}
                    </p>
                    {n.body && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>}
                  </div>
                  <time className="text-xs text-slate-400 shrink-0">
                    {new Date(n.created_at).toLocaleDateString()}
                  </time>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
