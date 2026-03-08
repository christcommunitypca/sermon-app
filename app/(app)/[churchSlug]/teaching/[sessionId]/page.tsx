import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSessionWithOutline, ensureOutline } from '@/lib/teaching'
import { OutlineEditor } from '@/components/teaching/OutlineEditor'
import { SessionStatus } from '@/types/database'
import { ChevronLeft, Edit, Tag, Clock, FileText, Presentation, FlaskConical } from 'lucide-react'
import { updateSessionStatusAction } from '../actions'

interface Props { params: { churchSlug: string; sessionId: string } }

const STATUS_NEXT: Partial<Record<SessionStatus, { label: string; next: SessionStatus }>> = {
  draft: { label: 'Publish', next: 'published' },
  published: { label: 'Mark delivered', next: 'delivered' },
}

export default async function SessionDetailPage({ params }: Props) {
  const { churchSlug, sessionId } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const data = await getSessionWithOutline(sessionId, user.id)
  if (!data) return notFound()

  const { session, blocks } = data
  let { outline } = data
  if (!outline) outline = await ensureOutline(sessionId, church.id)

  // Check if teacher has a valid AI key
  const { data: aiKey } = await supabaseAdmin
    .from('user_ai_keys')
    .select('validation_status')
    .eq('user_id', user.id)
    .single()
  const hasValidAIKey = aiKey?.validation_status === 'valid'

  // Get default flow if session type matches one
  const { data: flows } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('church_id', church.id)
    .eq('teacher_id', user.id)

  const matchingFlow = flows?.find(f => f.is_default_for === session.type)

  const nextStatus = STATUS_NEXT[session.status]

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between mb-6">
        <Link href={`/${churchSlug}/teaching`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="w-4 h-4" />Teaching
        </Link>
        <div className="flex items-center gap-2">
          {nextStatus && (
            <form action={updateSessionStatusAction.bind(null, sessionId, church.id, churchSlug, nextStatus.next)}>
              <button type="submit" className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                {nextStatus.label}
              </button>
            </form>
          )}
          <Link href={`/${churchSlug}/deliver/${sessionId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors">
            <Presentation className="w-3.5 h-3.5" />Deliver
          </Link>
        </div>
      </div>

      {/* Session header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">{session.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span>{session.type.replace('_', ' ')}</span>
              {session.scripture_ref && <span>· {session.scripture_ref}</span>}
              {session.estimated_duration && (
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{session.estimated_duration}m</span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                session.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                session.status === 'published' ? 'bg-blue-100 text-blue-700' :
                'bg-slate-100 text-slate-600'
              }`}>{session.status}</span>
            </div>
            {session.notes && <p className="mt-3 text-sm text-slate-600 whitespace-pre-wrap">{session.notes}</p>}
          </div>
          <Link href={`/${churchSlug}/teaching/${sessionId}/edit`}
            className="shrink-0 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Edit session details">
            <Edit className="w-4 h-4" />
          </Link>
        </div>

        {/* Sub-nav */}
        <div className="flex items-center gap-1 mt-5 pt-4 border-t border-slate-100 overflow-x-auto">
          {[
            { href: `/${churchSlug}/teaching/${sessionId}/research`, label: 'Research', icon: FlaskConical },
            { href: `/${churchSlug}/teaching/${sessionId}/thoughts`, label: 'Thoughts', icon: FileText },
            { href: `/${churchSlug}/teaching/${sessionId}/tags`, label: 'Tags', icon: Tag },
            { href: `/${churchSlug}/teaching/${sessionId}/history`, label: 'History', icon: Clock },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0">
              <Icon className="w-3.5 h-3.5" />{label}
            </Link>
          ))}
        </div>
      </div>

      {/* Outline editor */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Outline</h2>
        <OutlineEditor
          outlineId={outline.id}
          sessionId={sessionId}
          churchId={church.id}
          churchSlug={churchSlug}
          initialBlocks={blocks}
          flowStructure={matchingFlow?.structure}
          hasValidAIKey={hasValidAIKey}
        />
      </div>
    </div>
  )
}
