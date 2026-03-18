import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionWithOutline } from '@/lib/teaching'
import { DeliveryView } from '@/components/teaching/DeliveryView'

interface Props { params: { churchSlug: string; sessionId: string } }

// Full-screen — no AppNav wrapper, no network requests after load
export default async function DeliverPage({ params }: Props) {
  const { churchSlug, sessionId } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user

  const data = await getSessionWithOutline(sessionId, user.id)
  if (!data) return notFound()

  return (
    <DeliveryView
      session={data.session}
      blocks={data.blocks}
      churchSlug={churchSlug}
    />
  )
}
