import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Calendar } from 'lucide-react'
import { CalendarSettings } from '@/components/settings/CalendarSettings'
import { computeBuiltInDates, toISODate } from '@/lib/calendar/dates'
import { SERVICE_TYPES } from '@/lib/calendar/constants'
import type { CalendarEventWithImpacts } from '@/app/actions/calendar'

interface Props { params: { churchSlug: string } }

export default async function CalendarSettingsPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session: authSession } } = await supabase.auth.getSession()
  if (!authSession) redirect('/sign-in')

  const { data: church } = await supabaseAdmin
    .from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  // Load existing custom events
  const { data: eventsRaw } = await supabaseAdmin
    .from('church_calendar_events')
    .select('*, calendar_service_impacts(*)')
    .eq('church_id', church.id)
    .order('event_date', { ascending: true, nullsFirst: false })

  const events = (eventsRaw ?? []) as CalendarEventWithImpacts[]

  // Compute built-in recurring dates for next 2 years
  const thisYear = new Date().getFullYear()
  const builtInDates = computeBuiltInDates(thisYear, thisYear + 1)

  // Which built-in keys already have a custom event record
  const configuredKeys = new Set(events.map(e => e.recurrence_key).filter(Boolean))

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-1">
        <Calendar className="w-5 h-5 text-slate-500" />
        <h1 className="text-2xl font-bold text-slate-900">Church Calendar</h1>
      </div>
      <p className="text-sm text-slate-500 mb-8 ml-8">
        Configure recurring dates and one-time events that affect your teaching schedule.
        Scheduling impact can be set per service type.
      </p>

      <CalendarSettings
        churchId={church.id}
        churchSlug={churchSlug}
        events={events}
        builtInDates={builtInDates.map(d => ({
          ...d,
          dateStr: toISODate(d.date),
          isConfigured: configuredKeys.has(d.key),
        }))}
        serviceTypes={SERVICE_TYPES as unknown as { key: string; label: string }[]}
        currentYear={thisYear}
      />
    </div>
  )
}
