import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { hasValidKey } from '@/lib/ai/key'
import { getActiveProviderName } from '@/lib/ai/providers/resolver'
import { Plus, BookOpen, Clock, ArrowRight, Sparkles } from 'lucide-react'

interface Props { params: { churchSlug: string } }

export default async function DashboardPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user

  const { data: church } = await supabaseAdmin.from('churches').select('id, name').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const { data: profile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', user.id).single()

  const { data: sessions } = await supabaseAdmin
    .from('teaching_sessions')
    .select('id, title, type, status, scripture_ref, updated_at')
    .eq('church_id', church.id)
    .eq('teacher_id', user.id)
    .in('status', ['draft', 'published'])
    .order('updated_at', { ascending: false })
    .limit(5)

  const hasAIKey = await hasValidKey(user.id, getActiveProviderName())
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Pastor'

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Good to see you, {firstName}.</h1>
        <p className="text-sm text-slate-500 mt-1">{church.name}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <QuickAction href={`/${churchSlug}/teaching/new`} icon={Plus} label="New session" description="Start a sermon or lesson" primary />
        <QuickAction href={`/${churchSlug}/teaching`} icon={BookOpen} label="My sessions" description="View all teaching" />
        {!hasAIKey && (
          <QuickAction href={`/${churchSlug}/settings/ai`} icon={Sparkles} label="Set up AI" description="Add your OpenAI key to enable outline generation" />
        )}
      </div>

      {sessions && sessions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">Recent sessions</h2>
            <Link href={`/${churchSlug}/teaching`} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
              All sessions <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {sessions.map(session => (
              <Link key={session.id} href={`/${churchSlug}/teaching/${session.id}`}
                className="flex items-center gap-4 bg-white border border-slate-100 rounded-xl px-4 py-3 hover:border-slate-300 transition-all">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">{session.title}</span>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${session.status === 'published' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                      {session.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span>{session.type.replace('_', ' ')}</span>
                    {session.scripture_ref && <span>· {session.scripture_ref}</span>}
                  </div>
                </div>
                <span className="text-xs text-slate-300 shrink-0">{new Date(session.updated_at).toLocaleDateString()}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function QuickAction({ href, icon: Icon, label, description, primary }: {
  href: string; icon: any; label: string; description: string; primary?: boolean
}) {
  return (
    <Link href={href} className={`flex items-start gap-3 p-5 rounded-2xl border transition-all hover:shadow-sm ${primary ? 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${primary ? 'bg-slate-700' : 'bg-slate-100'}`}>
        <Icon className={`w-4 h-4 ${primary ? 'text-white' : 'text-slate-500'}`} />
      </div>
      <div>
        <p className={`text-sm font-semibold ${primary ? 'text-white' : 'text-slate-900'}`}>{label}</p>
        <p className={`text-xs mt-0.5 ${primary ? 'text-slate-300' : 'text-slate-400'}`}>{description}</p>
      </div>
    </Link>
  )
}
