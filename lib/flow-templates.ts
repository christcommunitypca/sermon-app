import type { FlowStep } from '@/types/database'

export type FlowTemplate = {
  id: string
  name: string
  description: string
  explanation: string
  steps: FlowStep[]
}

const step = (title: string, hint: string, type: FlowStep['suggested_block_type'] = 'point'): FlowStep => ({
  id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  title,
  prompt_hint: hint,
  suggested_block_type: type,
})

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: 'blank',
    name: 'Blank Flow',
    description: 'Start from scratch and build your own movement.',
    explanation: 'Use this when you already know the movement you want and just need a clean canvas.',
    steps: [],
  },
  {
    id: 'expository',
    name: 'Expository',
    description: 'Move through the text in a clear explanatory arc.',
    explanation: 'Best when the sermon should primarily explain the text and press its implications with clarity.',
    steps: [
      step('Opening', 'Introduce the burden and direction of the passage.', 'transition'),
      step('Explain the Text', 'Show what the passage says and how the parts fit together.', 'point'),
      step('Press the Meaning', 'Bring out the main doctrinal or pastoral force of the text.', 'point'),
      step('Apply the Truth', 'Show what faith, repentance, obedience, or comfort looks like.', 'application'),
    ],
  },
  {
    id: 'problem-grace-response',
    name: 'Problem / Grace / Response',
    description: 'Start with the need, then show grace, then call for response.',
    explanation: 'Useful when the sermon should clearly move from human need to divine provision to faith-filled action.',
    steps: [
      step('Problem', 'Expose the need, sin, fear, or brokenness the text reveals.', 'point'),
      step('Grace', 'Show how God answers that need in his promise, mercy, or Christ.', 'point'),
      step('Response', 'Call for trust, repentance, worship, or obedience.', 'application'),
    ],
  },
  {
    id: 'doctrine-delight-duty',
    name: 'Doctrine / Delight / Duty',
    description: 'Truth leads to worship and then obedient response.',
    explanation: 'Use when you want the sermon to move from theological clarity to affection and then to life.',
    steps: [
      step('Doctrine', 'State and clarify the truth the text teaches.', 'point'),
      step('Delight', 'Show why this truth is good, beautiful, and worthy of trust.', 'illustration'),
      step('Duty', 'Show what living in light of this truth requires.', 'application'),
    ],
  },
  {
    id: 'text-christ-church-response',
    name: 'Text / Christ / Church / Response',
    description: 'Explain the text, trace it to Christ, then to the church’s life.',
    explanation: 'Helpful when you want a clearly Christ-centered and ecclesial movement without forcing the text.',
    steps: [
      step('Text', 'Explain the passage in its own setting and flow.', 'point'),
      step('Christ', 'Show how the text finds its fullness in Christ.', 'point'),
      step('Church', 'Connect the truth to the church’s identity, worship, or mission.', 'point'),
      step('Response', 'Call for a clear response in faith and life.', 'application'),
    ],
  },
]
