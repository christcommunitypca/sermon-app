import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { SnapshotHistory } from '@/components/teaching/SnapshotHistory'
import { ensureOutline } from '@/lib/teaching'
import { ChevronLeft } from 'lucide-react'

interface Props { params: { churchSlug: string; sessionId: string } }

export default async function HistoryPage({ params }: Props) {
  const { churchSlug, sessionId } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const { data: session } = await supabaseAdmin
    .from('teaching_sessions').select('title').eq('id', sessionId).eq('teacher_id', user.id).single()
  if (!session) return notFound()

  const outline = await ensureOutline(sessionId, church.id)

  const { data: snapshots } = await supabaseAdmin
    .from('session_snapshots')
    .select('id, version_number, label, created_at, created_by')
    .eq('session_id', sessionId)
    .order('version_number', { ascending: false })

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/teaching/${sessionId}`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />{session.title}
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-8">Version history</h1>
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <SnapshotHistory
          snapshots={snapshots ?? []}
          sessionId={sessionId}
          outlineId={outline.id}
          churchId={church.id}
          churchSlug={churchSlug}
        />
      </div>
    </div>
  )
}
