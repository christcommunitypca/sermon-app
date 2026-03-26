import type { Flow, SessionType } from '@/types/database'

export type SessionFlowGroups = {
  suggested: Flow[]
  personal: Flow[]
  church: Flow[]
  personalDefault: Flow | null
  churchDefault: Flow | null
}

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  sermon: 'Sermon',
  sunday_school: 'Sunday School',
  bible_study: 'Bible Study',
}

export function getTypeLabel(value: unknown) {
  return typeof value === 'string' && value in SESSION_TYPE_LABELS
    ? SESSION_TYPE_LABELS[value as keyof typeof SESSION_TYPE_LABELS]
    : 'Session'
}

export function isPersonalFlow(flow: Pick<Flow, 'owner_user_id'>, userId: string) {
  return flow.owner_user_id === userId
}

export function groupFlowsForSessionType(flows: Flow[], sessionType: SessionType, userId: string): SessionFlowGroups {
  const personal = flows
    .filter(flow => flow.owner_user_id === userId)
    .sort((a, b) => a.name.localeCompare(b.name))
  const church = flows
    .filter(flow => flow.owner_user_id === null)
    .sort((a, b) => a.name.localeCompare(b.name))

  const personalDefault = personal.find(flow => flow.is_default_for === sessionType) ?? null
  const churchDefault = church.find(flow => flow.is_default_for === sessionType) ?? null

  const recommended = [
    ...personal.filter(flow => flow.recommended_for?.includes(sessionType) || flow.is_default_for === sessionType),
    ...church.filter(flow => flow.recommended_for?.includes(sessionType) || flow.is_default_for === sessionType),
  ]

  const seen = new Set<string>()
  const suggested = [personalDefault, churchDefault, ...recommended]
    .filter((flow): flow is Flow => !!flow)
    .filter(flow => {
      if (seen.has(flow.id)) return false
      seen.add(flow.id)
      return true
    })

  return { suggested, personal, church, personalDefault, churchDefault }
}
