import { suppressNextGalleryPersist } from '../gallery/autoPersist'
import { useGalleryStore } from '../gallery/galleryStore'
import type { ProjectSnapshot } from '../gallery/types'
import { useStrawMobileStore } from '../state/store'

interface ParkedDraft {
  project: ProjectSnapshot
  projectName: string
  activeGalleryId: string | null
}

let parked: ParkedDraft | null = null

function cloneSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  return structuredClone(snapshot)
}

/** Snapshot the working draft so preview can replace it and restore on exit. */
export function parkDraft(): void {
  const draft = useStrawMobileStore.getState()
  parked = {
    project: cloneSnapshot({
      shapes: draft.shapes,
      connections: draft.connections,
      strawSize: draft.strawSize,
      slots: draft.slots,
    }),
    projectName: draft.projectName,
    activeGalleryId: useGalleryStore.getState().activeGalleryId,
  }
}

/** Whether a draft is currently parked under a community preview. */
export function hasParkedDraft(): boolean {
  return parked !== null
}

/**
 * Restore the draft that was active before preview, or clear the scene when
 * nothing was parked. Always leaves preview mode.
 */
export function restoreParkedDraft(): void {
  suppressNextGalleryPersist()
  useStrawMobileStore.getState().setPreviewMode(false)

  const saved = parked
  parked = null

  if (!saved) {
    useStrawMobileStore.getState().reset()
    useGalleryStore.getState().clearActive()
    // Drop the preview snapshot that reset() just pushed onto the undo stack.
    useStrawMobileStore.setState({ past: [], future: [] })
    return
  }

  useStrawMobileStore.getState().loadProject(cloneSnapshot(saved.project))
  useStrawMobileStore.getState().setProjectName(saved.projectName)
  useGalleryStore.setState({ activeGalleryId: saved.activeGalleryId })
  // loadProject pushHistory'd the preview scene — don't let Undo restore it.
  useStrawMobileStore.setState({ past: [], future: [] })
}

/**
 * Drop the parked draft without restoring it — used when the user duplicates
 * into their gallery and continues into the full editor.
 */
export function discardParkedDraft(): void {
  parked = null
  useStrawMobileStore.getState().setPreviewMode(false)
}
