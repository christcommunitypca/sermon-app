'use server'

import { getActionUser } from '@/lib/supabase/auth-context'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUserTradition } from '@/lib/research'
import { ProposedWeek } from '@/types/database'
import { SeriesStatus } from '@/types/database'
import { ensureOutline } from '@/lib/teaching'

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
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }
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
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

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
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

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
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

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
  redirect(`/${churchSlug}/teaching/${session.id}`)
}

// ── Archive series ─────────────────────────────────────────────────────────────
export async function archiveSeriesAction(
  seriesId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { error } = await supabaseAdmin
    .from('series')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', seriesId)
    .eq('teacher_id', user.id)

  if (error) return { error: error.message }
  revalidatePath(`/${churchSlug}/series`)
  return {}
}

// ── Unarchive series ───────────────────────────────────────────────────────────
export async function unarchiveSeriesAction(
  seriesId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { error } = await supabaseAdmin
    .from('series')
    .update({ status: 'planning', updated_at: new Date().toISOString() })
    .eq('id', seriesId)
    .eq('teacher_id', user.id)
    .eq('status', 'archived')

  if (error) return { error: error.message }
  revalidatePath(`/${churchSlug}/series`)
  return {}
}

// ── Delete series ──────────────────────────────────────────────────────────────
// Must be archived first. Cascades to series_sessions (FK on delete cascade).
export async function deleteSeriesAction(
  seriesId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { data: series } = await supabaseAdmin
    .from('series')
    .select('status, teacher_id')
    .eq('id', seriesId)
    .single()

  if (!series || series.teacher_id !== user.id) return { error: 'Not found' }
  if (series.status !== 'archived') {
    return { error: 'Archive this series before deleting it.' }
  }

  await supabaseAdmin
    .from('series')
    .delete()
    .eq('id', seriesId)
    .eq('teacher_id', user.id)

  redirect(`/${churchSlug}/series`)
}

// ── Skip a week ────────────────────────────────────────────────────────────────
// Marks the week as skipped with an optional reason.
// Does NOT shift subsequent weeks — that's a separate action.

export async function skipWeekAction(
  seriesSessionId: string,
  seriesId: string,
  churchSlug: string,
  skipReason: string | null
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const { data: ss } = await supabaseAdmin
    .from('series_sessions')
    .select('series_id, series(teacher_id)')
    .eq('id', seriesSessionId)
    .single()

  if ((ss?.series as any)?.teacher_id !== user.id) return { error: 'Unauthorized' }

  const { error } = await supabaseAdmin
    .from('series_sessions')
    .update({
      week_type: 'skipped',
      skip_reason: skipReason || null,
      status: 'planned',
      session_id: null,
    })
    .eq('id', seriesSessionId)

  if (error) return { error: error.message }
  revalidatePath(`/${churchSlug}/series/${seriesId}`)
  return {}
}

// ── Set guest preacher ─────────────────────────────────────────────────────────

export async function setGuestPreacherAction(
  seriesSessionId: string,
  seriesId: string,
  churchSlug: string,
  guestName: string,
  inSeries: boolean
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const { data: ss } = await supabaseAdmin
    .from('series_sessions')
    .select('series_id, series(teacher_id)')
    .eq('id', seriesSessionId)
    .single()

  if ((ss?.series as any)?.teacher_id !== user.id) return { error: 'Unauthorized' }

  const { error } = await supabaseAdmin
    .from('series_sessions')
    .update({
      week_type: 'guest',
      guest_name: guestName.trim(),
      guest_in_series: inSeries,
      status: 'planned',
    })
    .eq('id', seriesSessionId)

  if (error) return { error: error.message }
  revalidatePath(`/${churchSlug}/series/${seriesId}`)
  return {}
}

// ── Restore a week to normal ───────────────────────────────────────────────────

export async function restoreWeekAction(
  seriesSessionId: string,
  seriesId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const { data: ss } = await supabaseAdmin
    .from('series_sessions')
    .select('series_id, series(teacher_id)')
    .eq('id', seriesSessionId)
    .single()

  if ((ss?.series as any)?.teacher_id !== user.id) return { error: 'Unauthorized' }

  const { error } = await supabaseAdmin
    .from('series_sessions')
    .update({
      week_type: 'normal',
      skip_reason: null,
      guest_name: null,
      guest_in_series: false,
    })
    .eq('id', seriesSessionId)

  if (error) return { error: error.message }
  revalidatePath(`/${churchSlug}/series/${seriesId}`)
  return {}
}

// ── Update a skipped week's title/scripture ────────────────────────────────────
// Skipped weeks can still have a title and scripture for display purposes.

export async function updateSkippedWeekAction(
  seriesSessionId: string,
  seriesId: string,
  churchSlug: string,
  updates: { proposed_title?: string; proposed_scripture?: string; skip_reason?: string }
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

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
  revalidatePath(`/${churchSlug}/series/${seriesId}`)
  return {}
}

// ── Shift subsequent weeks ─────────────────────────────────────────────────────
// Inserts a new blank week at a given position and renumbers everything after it.
// Used when "Skip This Week" also needs to push the series out by one.

export async function insertGapAfterWeekAction(
  seriesId: string,
  afterWeekNumber: number,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  // Verify ownership
  const { data: series } = await supabaseAdmin
    .from('series')
    .select('id, teacher_id, total_weeks')
    .eq('id', seriesId)
    .eq('teacher_id', user.id)
    .single()

  if (!series) return { error: 'Unauthorized' }

  // Get all weeks after the insertion point
  const { data: laterWeeks } = await supabaseAdmin
    .from('series_sessions')
    .select('id, week_number')
    .eq('series_id', seriesId)
    .gt('week_number', afterWeekNumber)
    .order('week_number', { ascending: false }) // descending to avoid unique constraint conflicts

  if (!laterWeeks) return { error: 'Could not load weeks' }

  // Renumber each week +1, descending order avoids unique constraint conflicts
  for (const w of laterWeeks) {
    await supabaseAdmin
      .from('series_sessions')
      .update({ week_number: w.week_number + 1 })
      .eq('id', w.id)
  }

  // Insert the new blank gap week
  await supabaseAdmin
    .from('series_sessions')
    .insert({
      series_id: seriesId,
      week_number: afterWeekNumber + 1,
      week_type: 'skipped',
      status: 'planned',
      proposed_title: null,
      proposed_scripture: null,
    })

  // Update series total_weeks
  await supabaseAdmin
    .from('series')
    .update({ total_weeks: (series.total_weeks ?? 0) + 1 })
    .eq('id', seriesId)

  revalidatePath(`/${churchSlug}/series/${seriesId}`)
  return {}
}