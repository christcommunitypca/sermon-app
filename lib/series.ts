import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Series, SeriesSession } from '@/types/database'

export async function getSeriesForTeacher(churchId: string, teacherId: string): Promise<Series[]> {
  const { data } = await supabaseAdmin
    .from('series')
    .select('*')
    .eq('church_id', churchId)
    .eq('teacher_id', teacherId)
    .order('updated_at', { ascending: false })
  return (data ?? []) as Series[]
}

export async function getSeriesWithSessions(seriesId: string, teacherId: string): Promise<{
  series: Series
  sessions: (SeriesSession & { teaching_session?: { title: string; status: string } | null })[]
} | null> {
  const { data: series } = await supabaseAdmin
    .from('series')
    .select('*')
    .eq('id', seriesId)
    .eq('teacher_id', teacherId)
    .single()

  if (!series) return null

  const { data: sessions } = await supabaseAdmin
    .from('series_sessions')
    .select('*, teaching_sessions(title, status)')
    .eq('series_id', seriesId)
    .order('week_number')

  return {
    series: series as Series,
    sessions: (sessions ?? []) as any,
  }
}

export async function getNextUndeliveredSession(seriesId: string): Promise<SeriesSession | null> {
  const { data } = await supabaseAdmin
    .from('series_sessions')
    .select('*')
    .eq('series_id', seriesId)
    .neq('status', 'delivered')
    .order('week_number')
    .limit(1)
    .single()
  return data as SeriesSession | null
}
