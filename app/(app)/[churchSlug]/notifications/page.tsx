import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NotificationList } from '@/components/notifications/NotificationList'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Notifications' }

export default async function NotificationsPage({ params }: { params: { churchSlug: string } }) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user

  const { data: church } = await supabaseAdmin
    .from('churches').select('id').eq('slug', params.churchSlug).single()

  const { data: notifications } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: prefs } = await supabaseAdmin
    .from('notification_prefs')
    .select('email_enabled')
    .eq('user_id', user.id)
    .eq('church_id', church?.id ?? '')
    .single()

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Notifications</h1>
      <NotificationList
        notifications={notifications ?? []}
        emailEnabled={prefs?.email_enabled ?? true}
        churchSlug={params.churchSlug}
        churchId={church?.id ?? ''}
        userId={user.id}
      />
    </div>
  )
}
