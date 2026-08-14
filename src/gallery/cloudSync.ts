import { create } from 'zustand'
import { useAuthStore } from '../auth/authStore'
import { deleteCloudEntry, upsertCloudEntry } from './cloudGallery'
import { requeueUnsentCloudWrites } from './requeueUnsentCloudWrites'
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
let draining = false

function publish(error: string | null): void {
  useCloudSyncStore.setState({
    pending: timer !== null || draining,
    error,
  })
}

function markPending(): void {
  useCloudSyncStore.setState({ pending: true })
}

async function drainOnce(): Promise<boolean> {
  const userId = useAuthStore.getState().user?.id
  if (!userId) {
    pendingUpserts.clear()
    pendingDeletes.clear()
    publish(null)
    return false
  }

  const upserts = [...pendingUpserts.values()]
  const deletes = [...pendingDeletes]
  pendingUpserts.clear()
  pendingDeletes.clear()

  let upsertIndex = 0
  let deleteIndex = 0
  try {
    for (; upsertIndex < upserts.length; upsertIndex++) {
      await upsertCloudEntry(upserts[upsertIndex], userId)
    }
    for (; deleteIndex < deletes.length; deleteIndex++) {
      await deleteCloudEntry(deletes[deleteIndex])
    }
    return true
  } catch (error) {
    // Keep the failed item and anything not yet sent so Retry / the next
    // edit can flush them. Newer upserts or deletes that arrived in flight
    // already sit on the maps and must not be overwritten.
    requeueUnsentCloudWrites(
      pendingUpserts,
      pendingDeletes,
      upserts.slice(upsertIndex),
      deletes.slice(deleteIndex),
    )
    publish(error instanceof Error ? error.message : 'gallery.cloudSaveFailed')
    return false
  }
}

async function drain(): Promise<void> {
  draining = true
  markPending()
  try {
    while (pendingUpserts.size > 0 || pendingDeletes.size > 0) {
      const ok = await drainOnce()
      if (!ok) return
    }
    publish(null)
  } finally {
    draining = false
    publish(useCloudSyncStore.getState().error)
  }
}

function kickDrain(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = drain().finally(() => {
    inFlight = null
  })
  return inFlight
}

function schedule(): void {
  markPending()
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void kickDrain()
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
    publish(useCloudSyncStore.getState().error)
    return
  }
  await kickDrain()
}

/** Re-send writes that failed, keeping the unsaved banner until they land. */
export function retryCloudSync(): void {
  markPending()
  void flushCloudSync()
}

export function discardCloudQueue(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  pendingUpserts.clear()
  pendingDeletes.clear()
  draining = false
  useCloudSyncStore.setState({ pending: false, error: null })
}
