'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function getActionUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function insertLessonAfterWeekAction(
  seriesId: string,
  afterWeekNumber: number,
  churchSlug: string,
  lessonData: { title: string; scripture: string; type: string; notes: string }
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const { data: series } = await supabaseAdmin
    .from('series')
    .select('id, teacher_id, total_weeks')
    .eq('id', seriesId)
    .eq('teacher_id', user.id)
    .single()

  if (!series) return { error: 'Unauthorized' }

  const { data: laterWeeks } = await supabaseAdmin
    .from('series_sessions')
    .select('id, week_number')
    .eq('series_id', seriesId)
    .gt('week_number', afterWeekNumber)
    .order('week_number', { ascending: false })

  for (const w of laterWeeks ?? []) {
    await supabaseAdmin
      .from('series_sessions')
      .update({ week_number: w.week_number + 1 })
      .eq('id', w.id)
  }

  const { error: insertError } = await supabaseAdmin
    .from('series_sessions')
    .insert({
      series_id:          seriesId,
      week_number:        afterWeekNumber + 1,
      week_type:          'normal',
      status:             'planned',
      proposed_title:     lessonData.title     || null,
      proposed_scripture: lessonData.scripture || null,
      notes:              lessonData.notes      || null,
    })

  if (insertError) return { error: insertError.message }

  await supabaseAdmin
    .from('series')
    .update({ total_weeks: (series.total_weeks ?? 0) + 1 })
    .eq('id', seriesId)

  revalidatePath(`/${churchSlug}/series/${seriesId}`)
  return {}
}

export async function deleteSeriesWeekAction(
  seriesSessionId: string,
  seriesId: string,
  churchSlug: string,
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const { data: ss } = await supabaseAdmin
    .from('series_sessions')
    .select('id, week_number, session_id, series(teacher_id, total_weeks)')
    .eq('id', seriesSessionId)
    .single()

  if (!ss) return { error: 'Week not found.' }
  const seriesData = (ss as any).series
  if (seriesData?.teacher_id !== user.id) return { error: 'Unauthorized.' }
  if (ss.session_id) return { error: 'Cannot delete a week with a linked teaching session.' }

  const { error: delError } = await supabaseAdmin
    .from('series_sessions')
    .delete()
    .eq('id', seriesSessionId)

  if (delError) return { error: delError.message }

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

  const currentTotal = seriesData?.total_weeks ?? 0
  if (currentTotal > 0) {
    await supabaseAdmin
      .from('series')
      .update({ total_weeks: currentTotal - 1 })
      .eq('id', seriesId)
  }

  revalidatePath(`/${churchSlug}/series/${seriesId}`)
  return {}
}