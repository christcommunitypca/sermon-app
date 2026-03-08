import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Search } from 'lucide-react'

interface Props {
  params: { churchSlug: string }
  searchParams: { q?: string }
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { churchSlug } = params
  const query = searchParams.q?.trim() ?? ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  let results: any[] = []

  if (query.length >= 2) {
    // Search teacher's own sessions by title, scripture, notes
    const { data } = await supabaseAdmin
      .from('teaching_sessions')
      .select('id, title, type, status, scripture_ref, notes, updated_at')
      .eq('church_id', church.id)
      .eq('teacher_id', user.id)
      .or(`title.ilike.%${query}%,scripture_ref.ilike.%${query}%,notes.ilike.%${query}%`)
      .order('updated_at', { ascending: false })
      .limit(30)
    results = data ?? []
  }

  function excerpt(text: string | null, q: string): string | null {
    if (!text || !q) return null
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return null
    const start = Math.max(0, idx - 40)
    const end = Math.min(text.length, idx + q.length + 60)
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Search</h1>

      <form method="GET" className="mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search your sessions by title, scripture, or notes…"
            autoFocus
            className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
      </form>

      {query.length > 0 && query.length < 2 && (
        <p className="text-sm text-slate-400">Type at least 2 characters to search.</p>
      )}

      {query.length >= 2 && results.length === 0 && (
        <p className="text-sm text-slate-400">No sessions found for "{query}".</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400 mb-3">{results.length} result{results.length !== 1 ? 's' : ''} for "{query}"</p>
          {results.map(session => {
            const notesExcerpt = excerpt(session.notes, query)
            return (
              <Link key={session.id} href={`/${churchSlug}/teaching/${session.id}`}
                className="block bg-white border border-slate-100 rounded-xl px-4 py-3.5 hover:border-slate-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-slate-900">{session.title}</span>
                  <span className="text-xs text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded-full">{session.status}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400 mb-1">
                  <span>{session.type.replace('_', ' ')}</span>
                  {session.scripture_ref && <span>· {session.scripture_ref}</span>}
                </div>
                {notesExcerpt && (
                  <p className="text-xs text-slate-500 mt-1 italic">{notesExcerpt}</p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
