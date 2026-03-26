import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

interface Props { params: { churchSlug: string } }

export default async function SystemAdminsPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()
  const { data: globalAdmin } = await supabaseAdmin.from('global_admins').select('user_id').eq('user_id', session.user.id).maybeSingle()
  if (!globalAdmin) redirect(`/${churchSlug}/settings/church-setup/flows`)
  const { data: admins } = await supabaseAdmin.from('global_admins').select('user_id, profiles(full_name, avatar_url)')
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/settings/system-setup/templates`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors"><ChevronLeft className="w-4 h-4" />System Setup</Link>
      <div className="mb-6"><h1 className="text-2xl font-bold text-slate-900">System Admins</h1><p className="text-sm text-slate-500 mt-1">Manage the people who have platform-wide authority and access to all churches.</p></div>
      <div className="space-y-3">{(admins ?? []).map((row: any) => { const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles; return <div key={row.user_id} className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-3"><Shield className="w-5 h-5 text-amber-600" /><div><div className="font-semibold text-slate-900">{profile?.full_name ?? row.user_id}</div><div className="text-sm text-slate-500">System Admin</div></div></div> })}</div>
    </div>
  )
}
