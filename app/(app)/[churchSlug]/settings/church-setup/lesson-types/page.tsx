import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getChurchLessonTypes } from '@/lib/lesson-types'

interface Props { params: { churchSlug: string } }

export default async function ChurchLessonTypesPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')

  const { data: church } = await supabaseAdmin
    .from('churches')
    .select('id, name')
    .eq('slug', churchSlug)
    .single()

  if (!church) return notFound()
  
    const churchId = church.id
  const { data: member } = await supabaseAdmin
    .from('church_members')
    .select('role')
    .eq('church_id', church.id)
    .eq('user_id', session.user.id)
    .eq('is_active', true)
    .single()

  if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
    redirect(`/${churchSlug}/settings/church-setup/flows`)
  }

  const [lessonTypes, flowsResult] = await Promise.all([
    getChurchLessonTypes(church.id),
    supabaseAdmin
      .from('flows')
      .select('id, name')
      .eq('church_id', church.id)
      .is('owner_user_id', null)
      .eq('is_archived', false)
      .order('name'),
  ])

  const flows = flowsResult.data ?? []

  async function saveLessonTypeSettings(formData: FormData) {
    'use server'

    const churchId = formData.get('churchId') as string
    const typeKey = formData.get('typeKey') as string
    const label = (formData.get('label') as string).trim()
    const description = ((formData.get('description') as string) || '').trim() || null
    const defaultFlowId = ((formData.get('default_flow_id') as string) || '').trim() || null

    await supabaseAdmin
      .from('church_lesson_types')
      .update({
        label,
        description,
        default_flow_id: defaultFlowId,
        updated_at: new Date().toISOString(),
      })
      .eq('church_id', churchId)
      .eq('key', typeKey)

    redirect(`/${churchSlug}/settings/church-setup/lesson-types`)
  }

  async function toggleLessonTypeEnabled(formData: FormData) {
    'use server'

    const churchId = formData.get('churchId') as string
    const typeKey = formData.get('typeKey') as string
    const nextValue = formData.get('next_enabled') === 'true'

    await supabaseAdmin
      .from('church_lesson_types')
      .update({
        is_enabled: nextValue,
        updated_at: new Date().toISOString(),
      })
      .eq('church_id', churchId)
      .eq('key', typeKey)

    redirect(`/${churchSlug}/settings/church-setup/lesson-types`)
  }

  const enabledTypes = lessonTypes.filter(t => t.is_enabled)
  const disabledTypes = lessonTypes.filter(t => !t.is_enabled)

  function renderRow(type: typeof lessonTypes[number], muted = false) {
    return (
      <div
        key={type.key}
        className={`rounded-xl border border-slate-200 bg-white p-4 ${muted ? 'opacity-60' : ''}`}
      >
        <div className="grid grid-cols-12 gap-3 items-end">
          <div className="col-span-12 md:col-span-2">
            <div className="text-sm font-semibold text-slate-900">{type.label}</div>
          </div>

          <div className="col-span-12 md:col-span-1">
            <form action={toggleLessonTypeEnabled}>
              <input type="hidden" name="churchId" value={churchId}/>
              <input type="hidden" name="typeKey" value={type.key} />
              <input type="hidden" name="next_enabled" value={type.is_enabled ? 'false' : 'true'} />
              <button
                type="submit"
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                  type.is_enabled
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {type.is_enabled ? 'Enabled' : 'Disabled'}
              </button>
            </form>
          </div>

          <form action={saveLessonTypeSettings} className="col-span-12 md:col-span-9 grid grid-cols-12 gap-3 items-end">
            <input type="hidden" name="churchId" value={churchId} />
            <input type="hidden" name="typeKey" value={type.key} />

            <div className="col-span-12 md:col-span-3">
              <label className="block text-xs font-medium text-slate-500 mb-1">Label</label>
              <input
                name="label"
                defaultValue={type.label}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">Default Flow</label>
              {flows.length > 0 ? (
                <select
                  name="default_flow_id"
                  defaultValue={type.default_flow_id ?? ''}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">No default flow</option>
                  {flows.map(flow => (
                    <option key={flow.id} value={flow.id}>
                      {flow.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <Link
                    href={`/${churchSlug}/settings/church-setup/flows`}
                    className="font-medium text-violet-700 hover:text-violet-800"
                  >
                    Create a Shared Flow
                  </Link>
                </div>
              )}
            </div>

            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
              <input
                name="description"
                defaultValue={type.description ?? ''}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="col-span-12 md:col-span-1">
              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link
        href={`/${churchSlug}/settings/church-setup/flows`}
        className="mb-5 flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-slate-600"
      >
        <ChevronLeft className="w-4 h-4" />
        Church Setup
      </Link>

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Lesson Types</h1>
        <p className="mt-1 text-sm text-slate-500">
          Use lesson types to control which teaching options appear across the app and which flow each one starts with.
        </p>
      </div>

      <div className="hidden md:grid grid-cols-12 gap-3 px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <div className="col-span-2">Lesson Type</div>
        <div className="col-span-1">Status</div>
        <div className="col-span-3">Label</div>
        <div className="col-span-4">Default Flow</div>
        <div className="col-span-2">Description / Save</div>
      </div>

      <div className="space-y-3">
        {enabledTypes.map(type => renderRow(type))}
      </div>

      {disabledTypes.length > 0 && (
        <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Disabled lesson types ({disabledTypes.length})
          </summary>
          <div className="mt-3 space-y-3">
            {disabledTypes.map(type => renderRow(type, true))}
          </div>
        </details>
      )}
    </div>
  )
}