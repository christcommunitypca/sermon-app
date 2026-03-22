export const SESSION_SHARED_INSIGHTS_KEY = 'session:shared'

export function formatStudyScopeLabel(ref: string) {
  if (ref === SESSION_SHARED_INSIGHTS_KEY) return 'Session Research'
  if (ref.startsWith('pericope:')) return ref.replace(/^pericope:/, '')
  return ref
}
