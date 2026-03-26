import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type LessonTypeOption = {
  key: string
  label: string
  description: string | null
  is_enabled: boolean
  sort_order: number
  default_flow_id: string | null
}

const FALLBACKS: LessonTypeOption[] = [
  { key: 'sermon', label: 'Sermon', description: 'Primary preaching gatherings', is_enabled: true, sort_order: 10, default_flow_id: null },
  { key: 'sunday_school', label: 'Sunday School', description: 'Classroom or group teaching', is_enabled: true, sort_order: 20, default_flow_id: null },
  { key: 'bible_study', label: 'Bible Study', description: 'Midweek or small-group study', is_enabled: true, sort_order: 30, default_flow_id: null },
]

export async function getChurchLessonTypes(churchId: string): Promise<LessonTypeOption[]> {
  const { data, error } = await supabaseAdmin
    .from('church_lesson_types')
    .select('key, label, description, is_enabled, sort_order, default_flow_id')
    .eq('church_id', churchId)
    .order('sort_order', { ascending: true })

  if (error || !data?.length) return FALLBACKS
  return data as LessonTypeOption[]
}

export async function getEnabledChurchLessonTypes(churchId: string): Promise<LessonTypeOption[]> {
  const all = await getChurchLessonTypes(churchId)
  return all.filter(type => type.is_enabled)
}
