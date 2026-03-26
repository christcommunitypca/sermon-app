import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ProfileForm } from '@/components/settings/ProfileForm'
import Link from 'next/link'
import { ChevronRight, Church } from 'lucide-react'
import { Role } from '@/types/database'

interface Props { params: { churchSlug: string } }

export default async function ProfilePage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session: authSession } } = await supabase.auth.getSession()
  if (!authSession) redirect('/sign-in')
  const user = authSession.user

  const { data: member } = await supabaseAdmin
    .from('church_members')
    .select('role')
    .eq('church_id', (await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()).data?.id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
      </div>


      <div className="mb-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Profile</h2>
        <p className="text-sm text-slate-500">Your name and avatar are visible to other church members.</p>
      </div>

      <ProfileForm initialProfile={profile} userId={user.id} />

      {/* Quick links to other settings */}
      <div className="mt-8 space-y-2">
        <Link href={`/${churchSlug}/settings/tradition`}
          className="flex items-center justify-between px-4 py-3 bg-white border border-slate-100 rounded-xl hover:border-slate-300 transition-all">
          <div className="flex items-center gap-3">
            <Church className="w-4 h-4 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-800">Theological tradition</p>
              <p className="text-xs text-slate-400">Shapes AI research and series planning</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300" />
        </Link>
      </div>
    </div>
  )
}