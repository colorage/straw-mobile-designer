import { create } from 'zustand'
import { useAuthStore } from '../auth/authStore'
import { fetchCloudEntries, upsertCloudEntries } from './cloudGallery'
import { discardCloudQueue, flushCloudSync } from './cloudSync'
import { useGalleryStore } from './galleryStore'
import { createGalleryId } from './ids'
import type { GalleryEntry } from './types'

/** Cloud rows are keyed by uuid; older local ids may predate crypto.randomUUID. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface MigrationState {
  /** How many local mobiles were moved into the account on this sign-in. */
  movedCount: number | null
  dismiss: () => void
}

export const useMigrationStore = create<MigrationState>()((set) => ({
  movedCount: null,
  dismiss: () => set({ movedCount: null }),
}))

function localEntriesToUpload(): { entries: GalleryEntry[]; idMap: Map<string, string> } {
  const { entries, mode } = useGalleryStore.getState()
  const idMap = new Map<string, string>()
  if (mode !== 'local') return { entries: [], idMap }

  const uploadable = entries.map((entry) => {
    if (UUID_PATTERN.test(entry.id)) return entry
    const id = createGalleryId()
    idMap.set(entry.id, id)
    return { ...entry, id }
  })
  return { entries: uploadable, idMap }
}

/**
 * Take over the gallery for a freshly signed-in user: upload anything built as
 * a guest, then show the account's saves instead of the browser's. The local
 * library is dropped only after the upload succeeds, so a failed migration
 * leaves the guest's work untouched.
 */
async function adoptAccount(): Promise<void> {
  const { user } = useAuthStore.getState()
  if (!user) return

  const { entries: pendingLocal, idMap } = localEntriesToUpload()
  const previousActiveId = useGalleryStore.getState().activeGalleryId
  useGalleryStore.setState({ loading: true, loadError: null })

  try {
    if (pendingLocal.length > 0) {
      await upsertCloudEntries(pendingLocal, user.id)
      useMigrationStore.setState({ movedCount: pendingLocal.length })
    }

    const entries = await fetchCloudEntries()
    // A local id may have been rewritten during upload; keep the draft pointed
    // at the same project so the next autosave updates rather than duplicates.
    const remappedActiveId = previousActiveId
      ? (idMap.get(previousActiveId) ?? previousActiveId)
      : null
    const activeGalleryId = entries.some((entry) => entry.id === remappedActiveId)
      ? remappedActiveId
      : null

    useGalleryStore.setState({
      entries,
      activeGalleryId,
      mode: 'cloud',
      loading: false,
      loadError: null,
    })
  } catch (error) {
    useGalleryStore.setState({
      loading: false,
      loadError:
        error instanceof Error
          ? error.message
          : 'Could not open your account gallery. Your local mobiles are still here.',
    })
  }
}

/** Drop the account's saves from memory and hand the gallery back to guest mode. */
function releaseAccount(): void {
  discardCloudQueue()
  useMigrationStore.setState({ movedCount: null })
  useGalleryStore.setState({
    entries: [],
    activeGalleryId: null,
    mode: 'local',
    loading: false,
    loadError: null,
  })
}

let currentUserId: string | null = null

useAuthStore.subscribe((state) => {
  const nextUserId = state.user?.id ?? null
  if (nextUserId === currentUserId) return
  currentUserId = nextUserId

  if (nextUserId) {
    void adoptAccount()
  } else {
    releaseAccount()
  }
})

/** Best-effort push of queued cloud writes when the tab goes away. */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushCloudSync()
  })
}

/** Retry loading the account gallery after a failure. */
export function reloadAccountGallery(): void {
  void adoptAccount()
}
