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
/**
 * Ids the user has deleted. Survives across in-flight upserts so a stale write
 * that started before the delete cannot recreate the row afterwards.
 */
const deletedIds = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null
let inFlight: Promise<void> | null = null

function markPending(): void {
  useCloudSyncStore.setState({ pending: true })
}

function settle(error: string | null): void {
  const stillQueued =
    pendingUpserts.size > 0 || pendingDeletes.size > 0 || timer !== null || inFlight !== null
  useCloudSyncStore.setState({ pending: stillQueued, error })
}

function requeueFailed(upserts: GalleryEntry[], deletes: string[]): void {
  for (const entry of upserts) {
    // A newer upsert or a delete queued while we were failing wins.
    if (pendingUpserts.has(entry.id) || deletedIds.has(entry.id) || pendingDeletes.has(entry.id)) {
      continue
    }
    pendingUpserts.set(entry.id, entry)
  }
  for (const id of deletes) {
    if (pendingUpserts.has(id)) continue
    pendingDeletes.add(id)
    deletedIds.add(id)
  }
}

/** @returns true when the batch finished without error (failed ops are re-queued). */
async function drain(): Promise<boolean> {
  const userId = useAuthStore.getState().user?.id
  if (!userId) {
    pendingUpserts.clear()
    pendingDeletes.clear()
    deletedIds.clear()
    settle(null)
    return true
  }

  const upserts = [...pendingUpserts.values()]
  const deletes = [...pendingDeletes]
  pendingUpserts.clear()
  pendingDeletes.clear()

  if (upserts.length === 0 && deletes.length === 0) {
    settle(null)
    return true
  }

  const completedUpserts: GalleryEntry[] = []
  const completedDeletes: string[] = []

  try {
    for (const entry of upserts) {
      // Drop writes for ids deleted (or re-deleted) since this batch was copied.
      if (deletedIds.has(entry.id) || pendingDeletes.has(entry.id)) continue
      await upsertCloudEntry(entry, userId)
      completedUpserts.push(entry)
      // Delete won the race while the upsert was in flight — remove the row now.
      if (deletedIds.has(entry.id) || pendingDeletes.has(entry.id)) {
        await deleteCloudEntry(entry.id)
        pendingDeletes.delete(entry.id)
        deletedIds.delete(entry.id)
        completedDeletes.push(entry.id)
      }
    }
    for (const id of deletes) {
      await deleteCloudEntry(id)
      deletedIds.delete(id)
      completedDeletes.push(id)
    }
    settle(null)
    return true
  } catch (error) {
    const failedUpserts = upserts.filter(
      (entry) => !completedUpserts.some((done) => done.id === entry.id),
    )
    const failedDeletes = deletes.filter((id) => !completedDeletes.includes(id))
    requeueFailed(failedUpserts, failedDeletes)
    settle(error instanceof Error ? error.message : 'Could not save to your account.')
    return false
  }
}

/**
 * Run one drain at a time. Chains another pass only after success when more
 * work arrived mid-flight — failed ops stay queued for the next explicit
 * schedule/flush instead of spinning.
 */
async function runDrain(): Promise<void> {
  if (inFlight) {
    await inFlight
    // Prior pass owns retries for work that arrived mid-flight. If it failed,
    // requeued ops stay put until the next schedule/flush — do not spin here.
    if (useCloudSyncStore.getState().error) {
      settle(useCloudSyncStore.getState().error)
      return
    }
    if (pendingUpserts.size === 0 && pendingDeletes.size === 0) {
      settle(null)
      return
    }
  }

  let ok = false
  const pass = (async () => {
    ok = await drain()
  })().finally(() => {
    if (inFlight === pass) inFlight = null
  })
  inFlight = pass
  await pass

  if (ok && (pendingUpserts.size > 0 || pendingDeletes.size > 0)) {
    await runDrain()
  } else {
    settle(useCloudSyncStore.getState().error)
  }
}

function schedule(): void {
  markPending()
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void runDrain()
  }, CLOUD_SYNC_DEBOUNCE_MS)
}

export function queueCloudUpsert(entry: GalleryEntry): void {
  // A fresh save of this id (rare; usually new uuid) clears a prior delete intent.
  pendingDeletes.delete(entry.id)
  deletedIds.delete(entry.id)
  pendingUpserts.set(entry.id, entry)
  schedule()
}

export function queueCloudDelete(id: string): void {
  pendingUpserts.delete(id)
  pendingDeletes.add(id)
  deletedIds.add(id)
  schedule()
}

/** Send everything queued now — used before sign-out, on page hide, and after deletes. */
export async function flushCloudSync(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  markPending()
  await runDrain()
}

export function discardCloudQueue(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  pendingUpserts.clear()
  pendingDeletes.clear()
  deletedIds.clear()
  useCloudSyncStore.setState({ pending: false, error: null })
}
