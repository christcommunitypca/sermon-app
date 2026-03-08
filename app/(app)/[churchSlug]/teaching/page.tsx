import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSessionsForTeacher } from '@/lib/teaching'
import { SessionStatus } from '@/types/database'
import { Plus, BookOpen, Clock } from 'lucide-react'

interface Props { params: { churchSlug: string } }

const STATUS_STYLES: Record<SessionStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-blue-100 text-blue-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-stone-100 text-stone-500',
}

export default async function TeachingPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const sessions = await getSessionsForTeacher(church.id, user.id)

  const statuses: SessionStatus[] = ['draft', 'published', 'delivered', 'archived']
  const grouped = Object.fromEntries(statuses.map(s => [s, sessions.filter(x => x.status === s)])) as Record<SessionStatus, typeof sessions>

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teaching</h1>
          <p className="text-sm text-slate-500 mt-1">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href={`/${churchSlug}/teaching/new`} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
          <Plus className="w-4 h-4" />New session
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">No sessions yet</h3>
          <p className="text-sm text-slate-400 mb-6 max-w-sm">Create your first teaching session to start building outlines and preparing to preach.</p>
          <Link href={`/${churchSlug}/teaching/new`} className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
            <Plus className="w-4 h-4" />Create first session
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {statuses.map(status => {
            const group = grouped[status]
            if (!group.length) return null
            return (
              <section key={status}>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{status} · {group.length}</h2>
                <div className="space-y-2">
                  {group.map(session => (
                    <Link key={session.id} href={`/${churchSlug}/teaching/${session.id}`}
                      className="flex items-center gap-4 bg-white border border-slate-100 rounded-xl px-4 py-3.5 hover:border-slate-300 hover:shadow-sm transition-all group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-slate-900 truncate">{session.title}</span>
                          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[session.status as SessionStatus]}`}>{session.status}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span>{session.type.replace('_', ' ')}</span>
                          {session.scripture_ref && <span>· {session.scripture_ref}</span>}
                          {session.estimated_duration && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{session.estimated_duration}m</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-slate-300">{new Date(session.updated_at).toLocaleDateString()}</div>
                    </Link>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
