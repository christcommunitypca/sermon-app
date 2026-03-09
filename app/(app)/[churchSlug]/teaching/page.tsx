import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { SessionStatus } from '@/types/database'
import { Plus, BookOpen, Clock, Archive } from 'lucide-react'
import { SessionRowActions } from '@/components/teaching/SessionRowActions'

interface Props {
  params: { churchSlug: string }
  searchParams: { show?: string }
}

const STATUS_STYLES: Record<SessionStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-blue-100 text-blue-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-stone-100 text-stone-500',
}

// Statuses shown in default view (not archived)
const ACTIVE_STATUSES: SessionStatus[] = ['draft', 'published', 'delivered']

export default async function TeachingPage({ params, searchParams }: Props) {
  const { churchSlug } = params
  const showArchived = searchParams.show === 'archived'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: church } = await supabaseAdmin
    .from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  // Fetch relevant sessions based on view
  const query = supabaseAdmin
    .from('teaching_sessions')
    .select('id, title, type, status, scripture_ref, estimated_duration, updated_at')
    .eq('church_id', church.id)
    .eq('teacher_id', user.id)
    .order('updated_at', { ascending: false })

  const { data: sessions } = showArchived
    ? await query.eq('status', 'archived')
    : await query.in('status', ACTIVE_STATUSES)

  const allSessions = sessions ?? []

  // Count archived separately for the toggle label
  const { count: archivedCount } = await supabaseAdmin
    .from('teaching_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', church.id)
    .eq('teacher_id', user.id)
    .eq('status', 'archived')

  const statuses = showArchived ? (['archived'] as SessionStatus[]) : ACTIVE_STATUSES
  const grouped = Object.fromEntries(
    statuses.map(s => [s, allSessions.filter(x => x.status === s)])
  ) as Record<SessionStatus, typeof allSessions>

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teaching</h1>
          <p className="text-sm text-slate-500 mt-1">
            {showArchived ? `${allSessions.length} archived` : `${allSessions.length} active`}
          </p>
        </div>
        {!showArchived && (
          <Link href={`/${churchSlug}/teaching/new`}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
            <Plus className="w-4 h-4" />New session
          </Link>
        )}
      </div>

      {/* Archive toggle */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href={`/${churchSlug}/teaching`}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${!showArchived ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}
        >
          Active
        </Link>
        <Link
          href={`/${churchSlug}/teaching?show=archived`}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${showArchived ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}
        >
          <Archive className="w-3.5 h-3.5" />
          Archived
          {(archivedCount ?? 0) > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${showArchived ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {archivedCount}
            </span>
          )}
        </Link>
      </div>

      {allSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            {showArchived
              ? <Archive className="w-8 h-8 text-slate-300" />
              : <BookOpen className="w-8 h-8 text-slate-300" />
            }
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">
            {showArchived ? 'No archived sessions' : 'No sessions yet'}
          </h3>
          <p className="text-sm text-slate-400 mb-6 max-w-sm">
            {showArchived
              ? 'Archived sessions will appear here. Archive a session from its detail page or the actions menu.'
              : 'Create your first teaching session to start building outlines and preparing to preach.'
            }
          </p>
          {!showArchived && (
            <Link href={`/${churchSlug}/teaching/new`}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
              <Plus className="w-4 h-4" />Create first session
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {statuses.map(status => {
            const group = grouped[status]
            if (!group?.length) return null
            return (
              <section key={status}>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                  {status} · {group.length}
                </h2>
                <div className="space-y-2">
                  {group.map(session => (
                    <div key={session.id} className="flex items-center gap-2 group">
                      <Link href={`/${churchSlug}/teaching/${session.id}`}
                        className="flex-1 flex items-center gap-4 bg-white border border-slate-100 rounded-xl px-4 py-3.5 hover:border-slate-300 hover:shadow-sm transition-all min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-slate-900 truncate">{session.title}</span>
                            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[session.status as SessionStatus]}`}>
                              {session.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span>{session.type.replace('_', ' ')}</span>
                            {session.scripture_ref && <span>· {session.scripture_ref}</span>}
                            {session.estimated_duration && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />{session.estimated_duration}m
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-slate-300">
                          {new Date(session.updated_at).toLocaleDateString()}
                        </span>
                      </Link>
                      <SessionRowActions
                        sessionId={session.id}
                        churchId={church.id}
                        churchSlug={churchSlug}
                        isArchived={session.status === 'archived'}
                      />
                    </div>
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
