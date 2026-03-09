import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ProfileForm } from '@/components/settings/ProfileForm'
import Link from 'next/link'
import { ChevronRight, Church } from 'lucide-react'

interface Props { params: { churchSlug: string } }

export default async function ProfilePage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user

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

      {/* Settings nav */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
        {[
          { href: `/${churchSlug}/settings/profile`, label: 'Profile' },
          { href: `/${churchSlug}/settings/ai`, label: 'AI Key' },
          { href: `/${churchSlug}/settings/tradition`, label: 'Tradition' },
          { href: `/${churchSlug}/settings/notifications`, label: 'Notifications' },
        ].map(({ href, label }) => (
          <Link key={href} href={href}
            className="shrink-0 px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
            {label}
          </Link>
        ))}
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
