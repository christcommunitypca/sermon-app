export const SERVICE_TYPES = [
  { key: 'sermon_am',     label: 'Sunday Morning Sermon' },
  { key: 'sermon_pm',     label: 'Sunday Evening Sermon' },
  { key: 'sunday_school', label: 'Sunday School'         },
  { key: 'bible_study',   label: 'Wednesday Bible Study' },
] as const

export type ServiceTypeKey = typeof SERVICE_TYPES[number]['key']
