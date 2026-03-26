export const TRADITION_OPTIONS = [
  'Reformed',
  'Presbyterian',
  'Baptist',
  'Lutheran',
  'Anglican',
  'Evangelical',
  'Puritan',
] as const

export const STYLE_OPTIONS = [
  'Expository',
  'Christ-centered',
  'Redemptive-historical',
  'Narrative',
  'Big idea',
  'Doctrinal',
  'Experiential',
  'Law / Gospel',
  'Pastoral',
  'Evangelistic',
] as const

export const INFLUENCE_SUGGESTIONS = [
  'Bryan Chapell',
  'Tim Keller',
  'Edmund Clowney',
  'Haddon Robinson',
  'Martyn Lloyd-Jones',
  'John Stott',
  'Greidanus',
  'Puritan plain style',
] as const

export function formatFlowMetaLine(flow: {
  tradition_tags?: string[] | null
  style_tags?: string[] | null
  influenced_by?: string[] | null
}) {
  const chunks: string[] = []
  if (flow.tradition_tags?.length) chunks.push(flow.tradition_tags.slice(0, 2).join(' · '))
  if (flow.style_tags?.length) chunks.push(flow.style_tags.slice(0, 2).join(' · '))
  if (flow.influenced_by?.length) chunks.push(`In the vein of ${flow.influenced_by.slice(0, 2).join(', ')}`)
  return chunks.join(' • ')
}
