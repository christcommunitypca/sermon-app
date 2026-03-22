export type OutlineSelectedFlowStep = {
  id?: string
  title: string
  promptHint?: string | null
  suggestedBlockType?: string | null
}

export type OutlineSelectedFlow = {
  id?: string
  name: string
  description?: string | null
  explanation?: string | null
  steps: OutlineSelectedFlowStep[]
}

export type OutlineSelectedInsight = {
  verseRef: string
  category: string
  title: string
  content: string
}

export type OutlinePromptParts = {
  requestRules: string[]
  flowSummaryText: string
  flowDetailText: string
  durationRule: string
  durationUser: string
  thoughtText: string
  verseNotesText: string
  selectedInsightsText: string
}

export function buildOutlinePromptParts(args: {
  selectedFlow?: OutlineSelectedFlow | null
  selectedInsights?: OutlineSelectedInsight[]
  verseNotesForAI?: Record<string, string>
  thoughts?: Array<{ content?: string | null }>
  sessionEstimatedDuration?: number | null
}): OutlinePromptParts {
  const thoughtText =
    args.thoughts
      ?.filter(t => t.content?.trim())
      .map(t => `- ${t.content}`)
      .join('\n') || 'None provided.'

  const selectedFlow = args.selectedFlow ?? null

  const flowSummaryText =
    selectedFlow?.steps?.length
      ? `Follow the selected sermon flow "${selectedFlow.name}" and preserve its movement in order.`
      : 'No specific sermon flow has been selected. Use a clear, faithful sermon structure with natural movement.'

  const flowDetailText =
    selectedFlow?.steps?.length
      ? [
          `Flow name: ${selectedFlow.name}`,
          selectedFlow.description ? `Short description: ${selectedFlow.description}` : '',
          selectedFlow.explanation ? `Explanation: ${selectedFlow.explanation}` : '',
          'Ordered flow steps:',
          ...selectedFlow.steps.map((step, idx) => {
            const hint = step.promptHint ? ` — ${step.promptHint}` : ''
            const blockType = step.suggestedBlockType
              ? ` [suggested outline block: ${step.suggestedBlockType}]`
              : ''
            return `${idx + 1}. ${step.title}${hint}${blockType}`
          }),
        ]
          .filter(Boolean)
          .join('\n')
      : 'No sermon flow selected.'

  const durationRule = args.sessionEstimatedDuration
    ? `- CRITICAL: The total of all estimated_minutes values MUST sum to approximately ${args.sessionEstimatedDuration} minutes. Fit the outline to this target. Do not ignore this constraint.`
    : ''

  const durationUser = args.sessionEstimatedDuration
    ? `Target delivery time: ${args.sessionEstimatedDuration} minutes — the outline MUST fit this time`
    : 'Target delivery time: not specified'

  const verseNotesText = args.verseNotesForAI
    ? Object.entries(args.verseNotesForAI)
        .filter(([, note]) => note.trim())
        .map(([ref, note]) => `[${ref}] ${note}`)
        .join('\n')
    : ''

  const selectedInsightsText = args.selectedInsights?.length
    ? args.selectedInsights
        .map(i => {
          const prettyRef = i.verseRef === 'session:shared' ? 'Session Research' : i.verseRef.replace(/^pericope:/, '')
          return `[${prettyRef} / ${i.category}] ${i.title ? i.title + ': ' : ''}${i.content}`
        })
        .join('\n')
    : ''

  return {
    requestRules: [
      'Return ONLY a JSON array of blocks, no markdown, no explanation.',
      'Each block: { type, content, parent_index, estimated_minutes, confidence }',
      '- type: "point" | "sub_point" | "scripture" | "illustration" | "application" | "transition"',
      '- content: concise outline text, not a manuscript',
      '- parent_index: null for top-level blocks, or the 0-based index of the parent in this array',
      '- estimated_minutes: number or null',
      '- confidence: "high" | "medium" | "low"',
      '- high = clear scriptural direction',
      '- medium = reasonable interpretation',
      '- low = suggestion needing pastor review',
      '- Respect the selected sermon flow when one is provided, but adapt naturally to the text rather than forcing awkward sections.',
      '- Let the biblical text control the content, while the selected flow controls the movement and ordering.',
    ],
    flowSummaryText,
    flowDetailText,
    durationRule,
    durationUser,
    thoughtText,
    verseNotesText,
    selectedInsightsText,
  }
}

export function renderOutlinePromptForLLM(args: {
  session: {
    title: string
    type: string
    scriptureRef?: string | null
    notes?: string | null
    estimatedDuration?: number | null
  }
  parts: OutlinePromptParts
  version: string
}) {
  const { session, parts, version } = args

  const system = `You are a sermon outline assistant for pastors. Generate a structured outline in JSON format.

Rules:
${parts.requestRules.join('\n')}
- ${parts.flowSummaryText}
${parts.durationRule}`

  const user = `Create a preaching outline for:

Title: ${session.title}
Type: ${session.type}
Scripture: ${session.scriptureRef ?? 'Not specified'}
${parts.durationUser}
Notes: ${session.notes ?? 'None'}

Selected sermon flow:
${parts.flowDetailText}

Thought captures / raw ideas from the pastor:
${parts.thoughtText}${parts.verseNotesText ? `

Pastor's verse-by-verse study notes:
${parts.verseNotesText}` : ''}${parts.selectedInsightsText ? `

Research insights the pastor has selected to incorporate:
${parts.selectedInsightsText}` : ''}

Return a JSON array of outline blocks only.`

  return {
    system,
    user,
    version,
    temperature: 0.4,
  }
}

export function renderOutlinePromptForHuman(args: {
  session: {
    title: string
    type: string
    scriptureRef?: string | null
    notes?: string | null
    estimatedDuration?: number | null
  }
  parts: OutlinePromptParts
  version?: string
}) {
  const llm = renderOutlinePromptForLLM({
    ...args,
    version: args.version ?? 'preview',
  })

  const lines: string[] = []

  lines.push('# Outline Prompt Preview')
  lines.push('')

  lines.push('## System Instructions')
  lines.push('')
  lines.push(...formatPromptText(llm.system))
  lines.push('')

  lines.push('## User Request')
  lines.push('')
  lines.push(...formatPromptText(llm.user))
  lines.push('')

  lines.push('## Model Settings')
  lines.push('')
  lines.push(`- Version: ${llm.version}`)
  lines.push(`- Temperature: ${llm.temperature}`)
  lines.push('')

  return lines.join('\n')
}

function formatPromptText(text: string): string[] {
  const rawLines = text.split('\n')
  const out: string[] = []

  let inRules = false
  let inFlowSection = false

  for (const rawLine of rawLines) {
    const line = rawLine.trim()

    if (!line) {
      out.push('')
      continue
    }

    if (line === 'Rules:') {
      out.push('### Rules')
      inRules = true
      inFlowSection = false
      continue
    }

    if (line === 'Selected sermon flow:') {
      out.push('### Selected Sermon Flow')
      inRules = false
      inFlowSection = true
      continue
    }

    if (
      line.startsWith('Title:') ||
      line.startsWith('Type:') ||
      line.startsWith('Scripture:') ||
      line.startsWith('Target delivery time:') ||
      line.startsWith('Notes:')
    ) {
      out.push(`- ${line}`)
      inRules = false
      inFlowSection = false
      continue
    }

    if (
      line === 'Thought captures / raw ideas from the pastor:' ||
      line === "Pastor's verse-by-verse study notes:" ||
      line === 'Research insights the pastor has selected to incorporate:'
    ) {
      out.push(`### ${line}`)
      inRules = false
      inFlowSection = false
      continue
    }

    if (
      line.startsWith('Flow name:') ||
      line.startsWith('Short description:') ||
      line.startsWith('Explanation:') ||
      line === 'Ordered flow steps:'
    ) {
      out.push(`- ${line}`)
      continue
    }

    if (/^\d+\.\s/.test(line)) {
      out.push(`  ${line}`)
      continue
    }

    if (line.startsWith('- ')) {
      out.push(line)
      continue
    }

    if (line.startsWith('[') && line.includes(']')) {
      out.push(`- ${line}`)
      continue
    }

    if (inRules || inFlowSection) {
      out.push(`- ${line}`)
      continue
    }

    out.push(line)
  }

  return out
}