import { create } from 'zustand'
import { useAuthStore } from '../auth/authStore'
import { deleteCloudEntry, upsertCloudEntry } from './cloudGallery'
import type { GalleryEntry } from './types'

/**
 * Design edits already debounce a gallery write every 400ms; that cadence is
 * fine for localStorage but far too chatty for the network, so cloud writes
 * coalesce per entry on a longer timer.
 */
const CLOUD_SYNC_DEBOUNCE_MS = 1500

interface CloudSyncState {
  /** True while a batch is in flight or waiting to be sent. */
  pending: boolean
  error: string | null
  clearError: () => void
}

export const useCloudSyncStore = create<CloudSyncState>()((set) => ({
  pending: false,
  error: null,
  clearError: () => set({ error: null }),
}))

const pendingUpserts = new Map<string, GalleryEntry>()
const pendingDeletes = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null
let inFlight: Promise<void> | null = null

function markPending(): void {
  useCloudSyncStore.setState({ pending: true })
}

function settle(error: string | null): void {
  const stillQueued = pendingUpserts.size > 0 || pendingDeletes.size > 0 || timer !== null
  useCloudSyncStore.setState({ pending: stillQueued, error })
}

async function drain(): Promise<void> {
  const userId = useAuthStore.getState().user?.id
  if (!userId) {
    pendingUpserts.clear()
    pendingDeletes.clear()
    settle(null)
    return
  }

  const upserts = [...pendingUpserts.values()]
  const deletes = [...pendingDeletes]
  pendingUpserts.clear()
  pendingDeletes.clear()

  try {
    for (const entry of upserts) {
      await upsertCloudEntry(entry, userId)
    }
    for (const id of deletes) {
      await deleteCloudEntry(id)
    }
    settle(null)
  } catch (error) {
    settle(error instanceof Error ? error.message : 'Could not save to your account.')
  }
}

function schedule(): void {
  markPending()
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    inFlight = drain()
  }, CLOUD_SYNC_DEBOUNCE_MS)
}

export function queueCloudUpsert(entry: GalleryEntry): void {
  pendingDeletes.delete(entry.id)
  pendingUpserts.set(entry.id, entry)
  schedule()
}

export function queueCloudDelete(id: string): void {
  pendingUpserts.delete(id)
  pendingDeletes.add(id)
  schedule()
}

/** Send everything queued now — used before sign-out and on page hide. */
export async function flushCloudSync(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  if (inFlight) await inFlight
  if (pendingUpserts.size === 0 && pendingDeletes.size === 0) {
    settle(useCloudSyncStore.getState().error)
    return
  }
  inFlight = drain()
  await inFlight
}

export function discardCloudQueue(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  pendingUpserts.clear()
  pendingDeletes.clear()
  useCloudSyncStore.setState({ pending: false, error: null })
}
