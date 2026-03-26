import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { TraditionForm } from '@/components/settings/TraditionForm'
import { Role } from '@/types/database'

interface Props { params: { churchSlug: string } }

export default async function TraditionSettingsPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user

  const { data: church } = await supabaseAdmin
    .from('churches')
    .select('id')
    .eq('slug', churchSlug)
    .single()

  const { data: member } = church ? await supabaseAdmin
    .from('church_members')
    .select('role')
    .eq('church_id', church.id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() : { data: null as any }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('theological_tradition')
    .eq('id', user.id)
    .single()

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Theological tradition</h1>
        <p className="text-sm text-slate-500 mt-1">
          Shapes how AI research and series planning are framed for your ministry context.
        </p>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <TraditionForm
          userId={user.id}
          currentTradition={profile?.theological_tradition ?? null}
        />
      </div>
    </div>
  )
}