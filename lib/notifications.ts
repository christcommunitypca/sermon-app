import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NotificationCategory } from '@/types/database'

interface NotifyParams {
  churchId: string
  userId: string
  category: NotificationCategory
  title: string
  body?: string
  actionUrl?: string
}

// ── notify ────────────────────────────────────────────────────────────────────
// Creates an in-app notification row.
// Email delivery is gated on notification_prefs.email_enabled.
// Email sending is stubbed — plug in nodemailer or Resend here in iteration 2.
export async function notify({
  churchId, userId, category, title, body, actionUrl,
}: NotifyParams): Promise<void> {
  try {
    await supabaseAdmin.from('notifications').insert({
      church_id: churchId,
      user_id: userId,
      category,
      title,
      body: body ?? null,
      action_url: actionUrl ?? null,
    })

    // Email stub
    const { data: prefs } = await supabaseAdmin
      .from('notification_prefs')
      .select('email_enabled')
      .eq('church_id', churchId)
      .eq('user_id', userId)
      .single()

    if (prefs?.email_enabled) {
      // TODO iteration 2: send email via nodemailer/Resend
      console.log(`[notify] Email stub for user ${userId}: "${title}"`)
    }
  } catch (err) {
    console.error('[notify] failed:', err)
  }
}

// ── getUnreadCount ────────────────────────────────────────────────────────────
export async function getUnreadCount(userId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)

  return count ?? 0
}
