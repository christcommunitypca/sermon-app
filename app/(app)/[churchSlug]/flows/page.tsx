import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { FlowLibraryShell } from '@/components/flows/FlowLibraryShell'

interface Props { params: { churchSlug: string } }

export default async function FlowsPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const { data: flows } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('church_id', church.id)
    .eq('teacher_id', user.id)
    .eq('is_archived', false)
    .order('name')

  return (
    <FlowLibraryShell churchSlug={churchSlug} flows={flows ?? []} createHref={`/${churchSlug}/flows/new`}>
      <div className="bg-white border border-slate-200 rounded-2xl p-8">
        <h2 className="text-lg font-semibold text-slate-900">Choose or create a flow</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-2xl">
          Select an existing flow from the library on the left to edit it. Create a new flow when you want a new preaching pattern, or copy the steps from one you already have.
        </p>
      </div>
    </FlowLibraryShell>
  )
}
