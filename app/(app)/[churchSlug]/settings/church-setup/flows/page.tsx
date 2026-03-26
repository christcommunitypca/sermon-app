import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Flow, SessionType } from '@/types/database'
import { ChevronLeft, Plus } from 'lucide-react'

interface Props { params: { churchSlug: string } }

const TYPE_LABELS: Record<SessionType, string> = {
  sermon: 'Sermon',
  sunday_school: 'Sunday School',
  bible_study: 'Bible Study',
}

export default async function ChurchFlowsSettingsPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')

  const { data: church } = await supabaseAdmin.from('churches').select('id, name').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const { data: member } = await supabaseAdmin
    .from('church_members')
    .select('role')
    .eq('church_id', church.id)
    .eq('user_id', session.user.id)
    .eq('is_active', true)
    .single()
  if (!member) redirect('/sign-in?error=not_a_member')
  if (!(member.role === 'owner' || member.role === 'admin')) redirect(`/${churchSlug}/settings/my-setup/flows`)

  const { data: flows } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('church_id', church.id)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })

  const creatorIds = Array.from(new Set((flows ?? []).map(flow => flow.teacher_id)))
  const { data: profiles } = creatorIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', creatorIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> }
  const profileMap = new Map((profiles ?? []).map(profile => [profile.id, profile.full_name]))

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/settings/church-setup/flows`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />Shared Flows
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Shared Flows</h1>
        {!flows?.length && <p className="text-sm text-slate-500 mt-1">Shared flows give teachers a common starting point when they create a lesson.</p>}
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="text-sm text-slate-500">Use a shared default only when you want it to be the obvious starting point for that lesson type.</div>
        <Link href={`/${churchSlug}/flows/new`} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
          <Plus className="w-4 h-4" />Create flow
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(flows ?? []).map((flow: Flow) => {
          const editable = flow.teacher_id === session.user.id
          const inner = (
            <>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-semibold text-slate-900">{flow.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">Created by {profileMap.get(flow.teacher_id) ?? 'Unknown user'}</p>
                </div>
                {flow.is_default_for && (
                  <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">Default for {TYPE_LABELS[flow.is_default_for]}</span>
                )}
              </div>
              {flow.description && <p className="text-sm text-slate-500">{flow.description}</p>}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {flow.steps.slice(0, 4).map((step: { id?: string; title: string }, i: number) => (
                  <span key={step.id ?? i} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{step.title}</span>
                ))}
              </div>
            </>
          )
          return editable ? (
            <Link key={flow.id} href={`/${churchSlug}/flows/${flow.id}`} className="block bg-white border border-slate-100 rounded-xl p-5 hover:border-slate-300 hover:shadow-sm transition-all">
              {inner}
            </Link>
          ) : (
            <div key={flow.id} className="bg-white border border-slate-100 rounded-xl p-5">{inner}</div>
          )
        })}
      </div>

      {!flows?.length && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-sm text-slate-500">
          No shared flows yet.
        </div>
      )}
    </div>
  )
}
