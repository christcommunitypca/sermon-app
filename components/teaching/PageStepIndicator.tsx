'use client'
// Renders the step indicator in the page header (server page passes initial state)
import { StepIndicator } from './StepIndicator'
import { buildSteps } from './TeachingWorkspace'

interface Props {
  hasVerses:   boolean
  hasNotes:    boolean
  hasResearch: boolean
  hasBlocks:   boolean
  isPublished: boolean
}

export function PageStepIndicator({ hasVerses, hasNotes, hasResearch, hasBlocks, isPublished }: Props) {
  const steps = buildSteps(hasVerses, hasNotes, hasResearch, hasBlocks, isPublished)
  return <StepIndicator steps={steps} />
}
