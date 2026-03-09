'use client'

import { useRouter } from 'next/navigation'
import { ArchiveDeleteMenu } from '@/components/ui/ArchiveDeleteMenu'
import {
  archiveSessionAction,
  unarchiveSessionAction,
  deleteSessionAction,
} from '@/app/(app)/[churchSlug]/teaching/actions'

interface Props {
  sessionId: string
  churchId: string
  churchSlug: string
  isArchived: boolean
}

export function SessionRowActions({ sessionId, churchId, churchSlug, isArchived }: Props) {
  const router = useRouter()

  async function handleArchive() {
    await archiveSessionAction(sessionId, churchId, churchSlug)
    router.refresh()
  }

  async function handleUnarchive() {
    await unarchiveSessionAction(sessionId, churchSlug)
    router.refresh()
  }

  async function handleDelete() {
    await deleteSessionAction(sessionId, churchId, churchSlug)
    // redirect happens inside action, but refresh as fallback
    router.refresh()
  }

  return (
    <ArchiveDeleteMenu
      isArchived={isArchived}
      onArchive={handleArchive}
      onUnarchive={handleUnarchive}
      onDelete={handleDelete}
      entityLabel="session"
    />
  )
}
