import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ResearchCategory, ResearchItem } from '@/types/database'

export async function getResearchItemsForSession(
  sessionId: string,
  teacherId: string
): Promise<ResearchItem[]> {
  const { data } = await supabaseAdmin
    .from('research_items')
    .select('*')
    .eq('session_id', sessionId)
    .eq('teacher_id', teacherId)
    .eq('is_dismissed', false)
    .order('position')
    .order('created_at')
  return (data ?? []) as ResearchItem[]
}

export async function saveResearchItems(
  sessionId: string,
  churchId: string,
  teacherId: string,
  category: ResearchCategory,
  items: Omit<ResearchItem, 'id' | 'session_id' | 'church_id' | 'teacher_id' | 'created_at'>[]
): Promise<ResearchItem[]> {
  if (!items.length) return []

  const toInsert = items.map(item => ({
    session_id: sessionId,
    church_id: churchId,
    teacher_id: teacherId,
    ...item,
  }))

  const { data, error } = await supabaseAdmin
    .from('research_items')
    .insert(toInsert)
    .select()

  if (error) throw new Error(error.message)
  return (data ?? []) as ResearchItem[]
}

export async function getUserTradition(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('theological_tradition')
    .eq('id', userId)
    .single()
  return data?.theological_tradition ?? 'nondenominational'
}
