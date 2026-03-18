'use client'

import { useRouter } from 'next/navigation'
import { ArchiveDeleteMenu } from '@/components/ui/ArchiveDeleteMenu'
import { archiveFlowAction, unarchiveFlowAction, deleteFlowAction } from '@/app/(app)/[churchSlug]/flows/actions'

interface Props {
  flowId: string
  churchId: string
  churchSlug: string
  isArchived: boolean
}

export function FlowRowActions({ flowId, churchId, churchSlug, isArchived }: Props) {
  const router = useRouter()

  async function handleArchive() {
    await archiveFlowAction(flowId, churchSlug)
    router.refresh()
  }

  async function handleUnarchive() {
    await unarchiveFlowAction(flowId, churchSlug)
    router.refresh()
  }

  async function handleDelete() {
    await deleteFlowAction(flowId, churchId, churchSlug)
    router.refresh()
  }

  return (
    <ArchiveDeleteMenu
      isArchived={isArchived}
      onArchive={handleArchive}
      onUnarchive={handleUnarchive}
      onDelete={handleDelete}
      entityLabel="flow"
    />
  )
}
