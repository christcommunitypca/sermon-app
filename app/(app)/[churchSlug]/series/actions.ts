'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUserTradition } from '@/lib/research'
import { ProposedWeek } from '@/lib/ai/series'
import { SeriesStatus } from '@/types/database'
import { ensureOutline } from '@/lib/teaching'

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')
  return user!
}

// ── Create series with proposed weeks ─────────────────────────────────────────
export async function createSeriesAction(
  churchId: string,
  churchSlug: string,
  data: {
    title: string
    description: string | null
    scriptureSection: string
    totalWeeks: number
    startDate: string | null
    weeks: ProposedWeek[]
  }
): Promise<{ seriesId?: string; error?: string }> {
  const user = await getAuthUser()
  const tradition = await getUserTradition(user.id)

  const { data: series, error: seriesError } = await supabaseAdmin
    .from('series')
    .insert({
      church_id: churchId,
      teacher_id: user.id,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      scripture_section: data.scriptureSection.trim(),
      total_weeks: data.totalWeeks,
      start_date: data.startDate || null,
      tradition,
      status: 'planning',
    })
    .select()
    .single()

  if (seriesError || !series) return { error: seriesError?.message ?? 'Failed to create series' }

  if (data.weeks.length > 0) {
    const sessionRows = data.weeks.map(w => ({
      series_id: series.id,
      week_number: w.week_number,
      proposed_title: w.proposed_title,
      proposed_scripture: w.proposed_scripture,
      notes: w.notes,
      liturgical_note: w.liturgical_note,
      status: 'planned',
    }))

    const { error: sessionsError } = await supabaseAdmin
      .from('series_sessions')
      .insert(sessionRows)

    if (sessionsError) return { error: sessionsError.message }
  }

  redirect(`/${churchSlug}/series/${series.id}`)
}

// ── Update series meta ─────────────────────────────────────────────────────────
export async function updateSeriesAction(
  seriesId: string,
  churchSlug: string,
  updates: { title?: string; description?: string | null; start_date?: string | null; status?: SeriesStatus }
): Promise<{ error?: string }> {
  const user = await getAuthUser()

  const { error } = await supabaseAdmin
    .from('series')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', seriesId)
    .eq('teacher_id', user.id)

  if (error) return { error: error.message }
  revalidatePath(`/${churchSlug}/series/${seriesId}`)
  return {}
}

// ── Update a series session (week) ─────────────────────────────────────────────
export async function updateSeriesSessionAction(
  seriesSessionId: string,
  updates: {
    proposed_title?: string
    proposed_scripture?: string
    notes?: string
    liturgical_note?: string | null
  }
): Promise<{ error?: string }> {
  const user = await getAuthUser()

  // Verify ownership via series
  const { data: ss } = await supabaseAdmin
    .from('series_sessions')
    .select('series_id, series(teacher_id)')
    .eq('id', seriesSessionId)
    .single()

  if ((ss?.series as any)?.teacher_id !== user.id) return { error: 'Unauthorized' }

  const { error } = await supabaseAdmin
    .from('series_sessions')
    .update(updates)
    .eq('id', seriesSessionId)

  if (error) return { error: error.message }
  return {}
}

// ── Create a real teaching session from a series week ─────────────────────────
export async function createSessionFromSeriesWeekAction(
  seriesSessionId: string,
  seriesId: string,
  _unusedChurchId: string,   // kept for .bind() arity compat — resolved from series row
  churchSlug: string
): Promise<{ sessionId?: string; error?: string }> {
  const user = await getAuthUser()

  const { data: ss } = await supabaseAdmin
    .from('series_sessions')
    .select('*, series(teacher_id, tradition, church_id)')
    .eq('id', seriesSessionId)
    .single()

  if (!ss || (ss.series as any)?.teacher_id !== user.id) return { error: 'Unauthorized' }
  if (ss.session_id) return { error: 'Session already created for this week' }

  const churchId = (ss.series as any)?.church_id
  if (!churchId) return { error: 'Could not resolve church' }

  const { data: session, error } = await supabaseAdmin
    .from('teaching_sessions')
    .insert({
      church_id: churchId,
      teacher_id: user.id,
      type: 'sermon',
      title: ss.proposed_title ?? `Week ${ss.week_number}`,
      scripture_ref: ss.proposed_scripture ?? null,
      notes: ss.notes ?? null,
      status: 'draft',
      visibility: 'church',
    })
    .select()
    .single()

  if (error || !session) return { error: error?.message ?? 'Failed to create session' }

  await ensureOutline(session.id, churchId)

  // Link back to series session
  await supabaseAdmin
    .from('series_sessions')
    .update({ session_id: session.id, status: 'created' })
    .eq('id', seriesSessionId)

  revalidatePath(`/${churchSlug}/series/${seriesId}`)
  return { sessionId: session.id }
}

// ── Delete series ──────────────────────────────────────────────────────────────
export async function deleteSeriesAction(
  seriesId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getAuthUser()

  await supabaseAdmin
    .from('series')
    .delete()
    .eq('id', seriesId)
    .eq('teacher_id', user.id)

  redirect(`/${churchSlug}/series`)
}
