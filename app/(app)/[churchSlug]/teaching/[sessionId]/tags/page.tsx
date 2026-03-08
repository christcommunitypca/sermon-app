import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getTagsForSession, getAllTagsForChurch, getTaxonomiesForChurch } from '@/lib/teaching'
import { TagManager } from '@/components/teaching/TagManager'
import { ChevronLeft } from 'lucide-react'

interface Props { params: { churchSlug: string; sessionId: string } }

export default async function TagsPage({ params }: Props) {
  const { churchSlug, sessionId } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const { data: session } = await supabaseAdmin
    .from('teaching_sessions').select('title').eq('id', sessionId).eq('teacher_id', user.id).single()
  if (!session) return notFound()

  const [contentTags, allTags, taxonomies] = await Promise.all([
    getTagsForSession(sessionId, church.id),
    getAllTagsForChurch(church.id),
    getTaxonomiesForChurch(church.id),
  ])

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/teaching/${sessionId}`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />{session.title}
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-8">Tags</h1>
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <TagManager
          sessionId={sessionId}
          churchId={church.id}
          churchSlug={churchSlug}
          initialContentTags={contentTags as any}
          allTags={allTags as any}
          taxonomies={taxonomies}
        />
      </div>
    </div>
  )
}
