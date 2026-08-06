import { useAuthStore } from '../auth/authStore'
import { useGalleryStore } from '../gallery/galleryStore'
import { isCommunityEnabled, publishEntry } from './communityApi'
import { usePublishedMapStore } from './publishedMap'

const AUTO_PUBLISH_DEBOUNCE_MS = 1200

let autoPublishTimer: ReturnType<typeof setTimeout> | null = null
let pendingLocalId: string | null = null
let inFlight: Promise<void> | null = null

function clearAutoPublishTimer() {
  if (autoPublishTimer === null) return
  clearTimeout(autoPublishTimer)
  autoPublishTimer = null
}

/**
 * Push the latest local snapshot for a published gallery entry to the
 * community gallery. Debounced so rapid designer edits coalesce into one
 * network update. Failures are silent — editing must never block on sync.
 * Requires a signed-in account (same as manual publish).
 */
export function schedulePublishedSync(localId: string): void {
  if (!isCommunityEnabled) return
  if (!useAuthStore.getState().user?.id) return
  const record = usePublishedMapStore.getState().published[localId]
  if (!record) return

  pendingLocalId = localId
  clearAutoPublishTimer()
  autoPublishTimer = setTimeout(() => {
    autoPublishTimer = null
    const id = pendingLocalId
    pendingLocalId = null
    if (id) void runPublishedSync(id)
  }, AUTO_PUBLISH_DEBOUNCE_MS)
}

async function runPublishedSync(localId: string): Promise<void> {
  // Serialize syncs so overlapping saves do not race on the same public row.
  const previous = inFlight
  const next = (async () => {
    if (previous) await previous.catch(() => undefined)
    if (!useAuthStore.getState().user?.id) return
    const record = usePublishedMapStore.getState().published[localId]
    if (!record) return
    const entry = useGalleryStore.getState().entries.find((item) => item.id === localId)
    if (!entry) return
    try {
      const publicId = await publishEntry(entry, record.publicId)
      usePublishedMapStore.getState().markPublished(localId, publicId)
    } catch (err) {
      console.warn('Could not auto-update published mobile:', err)
    }
  })()
  inFlight = next
  await next
  if (inFlight === next) inFlight = null
}
