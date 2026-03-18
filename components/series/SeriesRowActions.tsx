'use client'

import { useRouter } from 'next/navigation'
import { ArchiveDeleteMenu } from '@/components/ui/ArchiveDeleteMenu'
import { archiveSeriesAction, unarchiveSeriesAction, deleteSeriesAction } from '@/app/(app)/[churchSlug]/series/actions'

interface Props {
  seriesId: string
  churchSlug: string
  isArchived: boolean
}

export function SeriesRowActions({ seriesId, churchSlug, isArchived }: Props) {
  const router = useRouter()

  async function handleArchive() {
    await archiveSeriesAction(seriesId, churchSlug)
    router.refresh()
  }

  async function handleUnarchive() {
    await unarchiveSeriesAction(seriesId, churchSlug)
    router.refresh()
  }

  async function handleDelete() {
    await deleteSeriesAction(seriesId, churchSlug)
    router.refresh()
  }

  return (
    <ArchiveDeleteMenu
      isArchived={isArchived}
      onArchive={handleArchive}
      onUnarchive={handleUnarchive}
      onDelete={handleDelete}
      entityLabel="series"
    />
  )
}
