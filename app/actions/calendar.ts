'use server'

import { revalidatePath } from 'next/cache'
import { getActionUser } from '@/lib/supabase/auth-context'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type ImpactType = 'informational' | 'skip' | 'replace'

export interface ServiceImpact {
  service_type: string
  impact: ImpactType
  notes?: string
}

// ── Create a calendar event ────────────────────────────────────────────────────
export async function createCalendarEventAction(
  churchId: string,
  churchSlug: string,
  data: {
    name: string
    description?: string
    event_type: 'recurring' | 'one_time'
    recurrence_key?: string       // for built-in recurring events
    event_date?: string           // for one_time events (ISO date)
    impacts: ServiceImpact[]
  }
): Promise<{ error?: string; id?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const { data: event, error } = await supabaseAdmin
    .from('church_calendar_events')
    .insert({
      church_id:      churchId,
      created_by:     user.id,
      name:           data.name.trim(),
      description:    data.description?.trim() || null,
      event_type:     data.event_type,
      recurrence_key: data.recurrence_key || null,
      event_date:     data.event_date || null,
      is_active:      true,
    })
    .select()
    .single()

  if (error || !event) return { error: error?.message ?? 'Failed to create event' }

  // Insert service impacts
  if (data.impacts.length > 0) {
    const { error: impactError } = await supabaseAdmin
      .from('calendar_service_impacts')
      .insert(data.impacts.map(imp => ({
        event_id:     event.id,
        service_type: imp.service_type,
        impact:       imp.impact,
        notes:        imp.notes?.trim() || null,
      })))

    if (impactError) return { error: impactError.message }
  }

  revalidatePath(`/${churchSlug}/settings/calendar`)
  return { id: event.id }
}

// ── Update a calendar event ────────────────────────────────────────────────────
export async function updateCalendarEventAction(
  eventId: string,
  churchSlug: string,
  data: {
    name?: string
    description?: string
    event_date?: string | null
    is_active?: boolean
    impacts?: ServiceImpact[]
  }
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.name        !== undefined) updates.name        = data.name.trim()
  if (data.description !== undefined) updates.description = data.description?.trim() || null
  if (data.event_date  !== undefined) updates.event_date  = data.event_date
  if (data.is_active   !== undefined) updates.is_active   = data.is_active

  const { error } = await supabaseAdmin
    .from('church_calendar_events')
    .update(updates)
    .eq('id', eventId)

  if (error) return { error: error.message }

  // Replace service impacts if provided
  if (data.impacts) {
    await supabaseAdmin
      .from('calendar_service_impacts')
      .delete()
      .eq('event_id', eventId)

    if (data.impacts.length > 0) {
      await supabaseAdmin
        .from('calendar_service_impacts')
        .insert(data.impacts.map(imp => ({
          event_id:     eventId,
          service_type: imp.service_type,
          impact:       imp.impact,
          notes:        imp.notes?.trim() || null,
        })))
    }
  }

  revalidatePath(`/${churchSlug}/settings/calendar`)
  return {}
}

// ── Delete a calendar event ────────────────────────────────────────────────────
export async function deleteCalendarEventAction(
  eventId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired.' }

  const { error } = await supabaseAdmin
    .from('church_calendar_events')
    .delete()
    .eq('id', eventId)

  if (error) return { error: error.message }
  revalidatePath(`/${churchSlug}/settings/calendar`)
  return {}
}

// ── Fetch all active events for a church ──────────────────────────────────────
export async function getCalendarEventsAction(
  churchId: string
): Promise<{ events: CalendarEventWithImpacts[]; error?: string }> {
  const { data, error } = await supabaseAdmin
    .from('church_calendar_events')
    .select('*, calendar_service_impacts(*)')
    .eq('church_id', churchId)
    .eq('is_active', true)
    .order('event_date', { ascending: true, nullsFirst: false })

  if (error) return { events: [], error: error.message }
  return { events: (data ?? []) as CalendarEventWithImpacts[] }
}

export interface CalendarEventWithImpacts {
  id: string
  church_id: string
  name: string
  description: string | null
  event_type: 'recurring' | 'one_time'
  recurrence_key: string | null
  event_date: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  calendar_service_impacts: {
    id: string
    service_type: string
    impact: ImpactType
    notes: string | null
  }[]
}
