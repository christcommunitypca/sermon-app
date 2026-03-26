import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Role } from '@/types/database'

export const metadata: Metadata = { title: 'Notification Settings' }

export default async function Page({ params }: { params: { churchSlug: string } }) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', params.churchSlug).single()
  if (!church) notFound()
  const { data: member } = await supabaseAdmin
    .from('church_members')
    .select('role')
    .eq('church_id', church.id)
    .eq('user_id', session.user.id)
    .eq('is_active', true)
    .single()

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900 mb-2">Notification Settings</h1>
      <p className="text-sm text-slate-400 mb-6">Email and in-app preferences — Phase 4</p>
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <p className="text-sm text-slate-500">Notification controls are still coming. This page now lives under your settings structure so it stays discoverable.</p>
      </div>
    </div>
  )
}