import { useStrawMobileStore } from '../state/store'
import { persistDraftToGallery, useGalleryStore } from './galleryStore'
import { isPhysicsTransformSyncing } from './physicsSyncGate'

const GALLERY_PERSIST_DEBOUNCE_MS = 400

let draftHydrated = useStrawMobileStore.persist.hasHydrated()
let galleryHydrated = useGalleryStore.persist.hasHydrated()
let persistTimer: ReturnType<typeof setTimeout> | null = null
/** Skip the draft change that follows load/reset so we do not immediately re-write. */
let suppressNextDesignPersist = false

function bothStoresHydrated(): boolean {
  return draftHydrated && galleryHydrated
}

function clearPersistTimer() {
  if (persistTimer === null) return
  clearTimeout(persistTimer)
  persistTimer = null
}

/** Debounced gallery write after design edits (thumbnail capture is relatively expensive). */
export function scheduleGalleryPersist(): void {
  if (!bothStoresHydrated()) return
  if (useStrawMobileStore.getState().isPreviewMode) return
  clearPersistTimer()
  persistTimer = setTimeout(() => {
    persistTimer = null
    if (useStrawMobileStore.getState().isPreviewMode) return
    persistDraftToGallery()
  }, GALLERY_PERSIST_DEBOUNCE_MS)
}

/** Immediate gallery write — used when leaving the designer for /gallery. */
export function flushGalleryPersist(): boolean {
  clearPersistTimer()
  if (!bothStoresHydrated()) return false
  if (useStrawMobileStore.getState().isPreviewMode) return false
  return persistDraftToGallery()
}

/** Call before actions that replace the draft from an existing gallery entry. */
export function suppressNextGalleryPersist(): void {
  suppressNextDesignPersist = true
  clearPersistTimer()
}

useStrawMobileStore.persist.onFinishHydration(() => {
  draftHydrated = true
})

useGalleryStore.persist.onFinishHydration(() => {
  galleryHydrated = true
})

useStrawMobileStore.subscribe((state, prev) => {
  if (!bothStoresHydrated()) return

  // Community preview must never write the local gallery.
  if (state.isPreviewMode) return

  // Pose sync for gallery/unload must not re-arm another persist cycle.
  if (isPhysicsTransformSyncing()) return

  const designChanged =
    state.shapes !== prev.shapes ||
    state.connections !== prev.connections ||
    state.strawSize !== prev.strawSize ||
    state.projectName !== prev.projectName ||
    state.slots !== prev.slots

  if (!designChanged) return

  if (suppressNextDesignPersist) {
    suppressNextDesignPersist = false
    return
  }

  scheduleGalleryPersist()
})
