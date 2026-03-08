import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createFlowAction } from '../actions'
import { ChevronLeft } from 'lucide-react'

interface Props { params: { churchSlug: string } }

export default async function NewFlowPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/flows`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />Flows
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-8">New flow</h1>
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <form action={createFlowAction} className="space-y-5">
          <input type="hidden" name="churchId" value={church.id} />
          <input type="hidden" name="churchSlug" value={churchSlug} />
          <input type="hidden" name="structure" value="[]" id="structure-hidden" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input name="name" required placeholder="e.g. Expository Sermon" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <input name="description" placeholder="Optional" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
          </div>
          <p className="text-sm text-slate-400">You can add and arrange blocks after creating the flow.</p>
          <button type="submit" className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
            Create flow
          </button>
        </form>
      </div>
    </div>
  )
}
