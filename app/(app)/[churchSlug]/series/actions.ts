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
    .select('*, series(teacher_id, tradition, church_id, start_date)')
    .eq('id', seriesSessionId)
    .single()

  if (!ss || (ss.series as any)?.teacher_id !== user.id) return { error: 'Unauthorized' }
  if (ss.session_id) return { error: 'Session already created for this week' }

  const churchId = (ss.series as any)?.church_id
  if (!churchId) return { error: 'Could not resolve church' }

  // Compute scheduled_date from series start_date + week offset
  const seriesStartDate = (ss.series as any)?.start_date as string | null
  let computedDate: string | null = null
  if (seriesStartDate) {
    const d = new Date(seriesStartDate + 'T00:00:00')
    d.setDate(d.getDate() + (ss.week_number - 1) * 7)
    computedDate = d.toISOString().split('T')[0]
  }

  const { data: session, error } = await supabaseAdmin
    .from('teaching_sessions')
    .insert({
      church_id: churchId,
      teacher_id: user.id,
      type: 'sermon',
      title: ss.proposed_title ?? `Week ${ss.week_number}`,
      scripture_ref: ss.proposed_scripture ?? null,
      notes: ss.notes ?? null,
      scheduled_date: computedDate,
      status: 'draft',
      visibility: 'church',
    })
    .select()
    .single()

  if (error || !session) return { error: error?.message ?? 'Failed to create session' }

  await ensureOutline(session.id, churchId)

  // Link back to series session, storing computed_date for future conflict detection
  await supabaseAdmin
    .from('series_sessions')
    .update({ session_id: session.id, status: 'created', computed_date: computedDate })
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
// Marks the current week slot as skipped (blank gap).
// The content that WAS in this week is preserved in proposed_title/scripture
// so the teacher can still see what was planned and add it back.
// If pushWeeks=true, a new blank slot is inserted BEFORE the current week's content,
// which effectively shifts the current week's content to the next available slot.

export async function skipWeekAction(
  seriesSessionId: string,
  seriesId: string,
  churchSlug: string,
  skipReason: string | null,
  pushWeeks: boolean
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const { data: ss } = await supabaseAdmin
    .from('series_sessions')
    .select('series_id, week_number, proposed_title, proposed_scripture, notes, series(teacher_id)')
    .eq('id', seriesSessionId)
    .single()

  if (!ss || (ss?.series as any)?.teacher_id !== user.id) return { error: 'Unauthorized' }

  if (pushWeeks) {
    // Shift all weeks from current position onwards +1, then blank the current slot
    const { data: laterWeeks } = await supabaseAdmin
      .from('series_sessions')
      .select('id, week_number')
      .eq('series_id', seriesId)
      .gte('week_number', ss.week_number)
      .order('week_number', { ascending: false })

    for (const w of laterWeeks ?? []) {
      await supabaseAdmin
        .from('series_sessions')
        .update({ week_number: w.week_number + 1 })
        .eq('id', w.id)
    }

    // Insert blank skipped slot at the original position
    await supabaseAdmin
      .from('series_sessions')
      .insert({
        series_id: seriesId,
        week_number: ss.week_number,
        week_type: 'skipped',
        skip_reason: skipReason || null,
        status: 'planned',
        proposed_title: null,
        proposed_scripture: null,
        is_gap_slot: true,      // marks this as a deletable gap on restore
      })

    // Bump total_weeks
    const { data: series } = await supabaseAdmin
      .from('series')
      .select('total_weeks')
      .eq('id', seriesId)
      .single()

    await supabaseAdmin
      .from('series')
      .update({ total_weeks: (series?.total_weeks ?? 0) + 1 })
      .eq('id', seriesId)
  } else {
    // Just mark this week as skipped, preserve content for display
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
  }

  revalidatePath(`/${churchSlug}/series/${seriesId}`)
  return {}
}

// ── Set guest preacher ─────────────────────────────────────────────────────────
// For standalone guests: inserts a blank week before the current week's content,
// shifting everything out by one. The guest week sits at the original slot.
// For in-series guests: just marks the current week as guest, no shift.

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
    .select('series_id, week_number, series(teacher_id)')
    .eq('id', seriesSessionId)
    .single()

  if (!ss || (ss?.series as any)?.teacher_id !== user.id) return { error: 'Unauthorized' }

  if (!inSeries) {
    // Standalone: shift current week's content to next slot, put guest in current slot
    const { data: laterWeeks } = await supabaseAdmin
      .from('series_sessions')
      .select('id, week_number')
      .eq('series_id', seriesId)
      .gte('week_number', ss.week_number)
      .order('week_number', { ascending: false })

    for (const w of laterWeeks ?? []) {
      await supabaseAdmin
        .from('series_sessions')
        .update({ week_number: w.week_number + 1 })
        .eq('id', w.id)
    }

    // Insert guest slot at original position
    await supabaseAdmin
      .from('series_sessions')
      .insert({
        series_id: seriesId,
        week_number: ss.week_number,
        week_type: 'guest',
        guest_name: guestName.trim(),
        guest_in_series: false,
        status: 'planned',
        is_gap_slot: true,      // marks this as a deletable gap on restore
      })

    const { data: series } = await supabaseAdmin
      .from('series')
      .select('total_weeks')
      .eq('id', seriesId)
      .single()

    await supabaseAdmin
      .from('series')
      .update({ total_weeks: (series?.total_weeks ?? 0) + 1 })
      .eq('id', seriesId)
  } else {
    // In-series: just mark this slot as guest, no shift
    const { error } = await supabaseAdmin
      .from('series_sessions')
      .update({
        week_type: 'guest',
        guest_name: guestName.trim(),
        guest_in_series: true,
        status: 'planned',
      })
      .eq('id', seriesSessionId)

    if (error) return { error: error.message }
  }

  revalidatePath(`/${churchSlug}/series/${seriesId}`)
  return {}
}

// ── Restore a week to normal ───────────────────────────────────────────────────
// Marks the week as normal. If it was a standalone guest or push-skipped slot
// (i.e. a row with no original content that was inserted as a gap), it is deleted
// and subsequent weeks are renumbered back.

export async function restoreWeekAction(
  seriesSessionId: string,
  seriesId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const { data: ss } = await supabaseAdmin
    .from('series_sessions')
    .select('series_id, week_number, proposed_title, proposed_scripture, week_type, is_gap_slot, series(teacher_id)')
    .eq('id', seriesSessionId)
    .single()

  if (!ss || (ss?.series as any)?.teacher_id !== user.id) return { error: 'Unauthorized' }

  // If this is a gap row (inserted blank slot by skip-with-push or standalone-guest):
  // delete it and renumber subsequent weeks back.
  // Use is_gap_slot — reliable even when teacher added optional title to the gap.
  const isGapRow = (ss as any).is_gap_slot === true

  if (isGapRow) {
    await supabaseAdmin
      .from('series_sessions')
      .delete()
      .eq('id', seriesSessionId)

    // Renumber weeks after this one back by 1
    const { data: laterWeeks } = await supabaseAdmin
      .from('series_sessions')
      .select('id, week_number')
      .eq('series_id', seriesId)
      .gt('week_number', ss.week_number)
      .order('week_number', { ascending: true })

    for (const w of laterWeeks ?? []) {
      await supabaseAdmin
        .from('series_sessions')
        .update({ week_number: w.week_number - 1 })
        .eq('id', w.id)
    }

    const { data: series } = await supabaseAdmin
      .from('series')
      .select('total_weeks')
      .eq('id', seriesId)
      .single()

    await supabaseAdmin
      .from('series')
      .update({ total_weeks: Math.max(0, (series?.total_weeks ?? 1) - 1) })
      .eq('id', seriesId)
  } else {
    // Original content row — flip back to normal and clear skip metadata
    // Note: we do NOT clear proposed_title/scripture — those were the original content
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
  }

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
