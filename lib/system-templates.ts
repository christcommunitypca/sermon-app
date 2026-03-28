import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'
import type { BlockType, SessionType } from '@/types/database'

export type SystemFlowTemplateStep = {
  id: string
  title: string
  prompt_hint?: string | null
  suggested_block_type?: BlockType | null
}

export type SystemFlowTemplate = {
  id: string
  name: string
  description: string | null
  explanation: string | null
  steps: SystemFlowTemplateStep[]
  recommended_for: SessionType[]
  is_archived: boolean
  created_at: string
  updated_at: string
}

export async function listSystemFlowTemplates(includeArchived = false) {
  let query = supabaseAdmin
    .from('system_flow_templates')
    .select('*')
    .order('updated_at', { ascending: false })

  if (!includeArchived) query = query.eq('is_archived', false)

  const { data } = await query
  return (data ?? []) as SystemFlowTemplate[]
}

export async function getSystemFlowTemplate(templateId: string) {
  const { data } = await supabaseAdmin
    .from('system_flow_templates')
    .select('*')
    .eq('id', templateId)
    .single()

  return (data ?? null) as SystemFlowTemplate | null
}