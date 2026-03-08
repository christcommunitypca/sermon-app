import { requireUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { TraditionForm } from '@/components/settings/TraditionForm'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

interface Props { params: { churchSlug: string } }

export default async function TraditionSettingsPage({ params }: Props) {
  const { churchSlug } = params
  const user = await requireUser()

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('theological_tradition')
    .eq('id', user.id)
    .single()

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <Link href={`/${churchSlug}/settings/profile`}
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />Settings
      </Link>
      <div className="mb-8">
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
