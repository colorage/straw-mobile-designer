import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { syncShapeTransformsFromPhysics } from '../physics/syncTransforms'
import { captureCanvasThumbnail } from '../scene/canvasBridge'
import { useStrawMobileStore } from '../state/store'
import { flushCloudSync, queueCloudDelete, queueCloudUpsert } from './cloudSync'
import { createGalleryId } from './ids'
import { downloadEntryJson } from './jsonIo'
import { nextProjectName } from './projectName'
import type { GalleryEntry, GalleryFileEnvelope, ProjectSnapshot } from './types'

const GALLERY_STORAGE_KEY = 'straw-mobile-designer/gallery'
const GALLERY_STORAGE_VERSION = 2

const PLACEHOLDER_THUMBNAIL =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
      <rect width="320" height="200" fill="#1b1e29"/>
      <text x="160" y="105" text-anchor="middle" fill="#9298ab" font-family="system-ui,sans-serif" font-size="14">No preview</text>
    </svg>`,
  )

function cloneSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  return structuredClone(snapshot)
}

function readDraftSnapshot(): ProjectSnapshot {
  const { shapes, connections, strawSize, slots } = useStrawMobileStore.getState()
  return cloneSnapshot({ shapes, connections, strawSize, slots })
}

function captureSnapshotForSave(): { project: ProjectSnapshot; thumbnailDataUrl: string } {
  syncShapeTransformsFromPhysics()
  const project = readDraftSnapshot()
  const thumbnailDataUrl = captureCanvasThumbnail() ?? PLACEHOLDER_THUMBNAIL
  return { project, thumbnailDataUrl }
}

/**
 * Where saves live. Guests keep the browser-local library; signing in switches
 * the same store over to the account's rows in Supabase.
 */
export type GalleryMode = 'local' | 'cloud'

interface GalleryState {
  entries: GalleryEntry[]
  /** Gallery entry currently loaded into the editor, if any. */
  activeGalleryId: string | null
  mode: GalleryMode
  /** True while the account's saves are being fetched. */
  loading: boolean
  /** Set when the account's saves could not be read. */
  loadError: string | null

  saveCurrent: (name: string) => string
  updateActive: () => boolean
  renameEntry: (id: string, name: string) => void
  deleteEntry: (id: string) => void
  loadEntry: (id: string) => boolean
  clearActive: () => void
  importEnvelope: (envelope: GalleryFileEnvelope) => string
  exportEntry: (id: string) => boolean
}

type PersistedGalleryState = Pick<GalleryState, 'entries' | 'activeGalleryId'>

/** Mirror a local mutation up to the account when signed in. */
function syncUp(entry: GalleryEntry | undefined, mode: GalleryMode): void {
  if (mode !== 'cloud' || !entry) return
  queueCloudUpsert(entry)
}

export const useGalleryStore = create<GalleryState>()(
  persist(
    (set, get) => ({
      entries: [],
      activeGalleryId: null,
      mode: 'local',
      loading: false,
      loadError: null,

      saveCurrent: (name) => {
        const trimmed =
          name.trim() || nextProjectName(get().entries.map((entry) => entry.name))
        const { project, thumbnailDataUrl } = captureSnapshotForSave()
        const now = new Date().toISOString()
        const id = createGalleryId()
        const entry: GalleryEntry = {
          id,
          name: trimmed,
          createdAt: now,
          updatedAt: now,
          thumbnailDataUrl,
          project,
        }
        useStrawMobileStore.getState().setProjectName(trimmed)
        set((state) => ({
          entries: [entry, ...state.entries],
          activeGalleryId: id,
        }))
        syncUp(entry, get().mode)
        return id
      },

      updateActive: () => {
        const { activeGalleryId, entries } = get()
        if (!activeGalleryId) return false
        const existing = entries.find((entry) => entry.id === activeGalleryId)
        if (!existing) return false

        const { project, thumbnailDataUrl } = captureSnapshotForSave()
        const now = new Date().toISOString()
        const draftName = useStrawMobileStore.getState().projectName.trim() || existing.name
        const updated: GalleryEntry = {
          ...existing,
          name: draftName,
          project,
          thumbnailDataUrl,
          updatedAt: now,
        }
        set((state) => ({
          entries: state.entries.map((entry) => (entry.id === activeGalleryId ? updated : entry)),
        }))
        syncUp(updated, get().mode)
        return true
      },

      renameEntry: (id, name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        const existing = get().entries.find((entry) => entry.id === id)
        if (!existing) return
        const updated: GalleryEntry = {
          ...existing,
          name: trimmed,
          updatedAt: new Date().toISOString(),
        }
        set((state) => ({
          entries: state.entries.map((entry) => (entry.id === id ? updated : entry)),
        }))
        syncUp(updated, get().mode)
      },

      deleteEntry: (id) => {
        set((state) => ({
          entries: state.entries.filter((entry) => entry.id !== id),
          activeGalleryId: state.activeGalleryId === id ? null : state.activeGalleryId,
        }))
        // Flush immediately so a stale in-flight upsert cannot recreate the row,
        // and so a reload before the debounce timer still sees the deletion.
        if (get().mode === 'cloud') {
          queueCloudDelete(id)
          void flushCloudSync()
        }
      },

      loadEntry: (id) => {
        const entry = get().entries.find((item) => item.id === id)
        if (!entry) return false
        useStrawMobileStore.getState().loadProject(cloneSnapshot(entry.project))
        useStrawMobileStore.getState().setProjectName(entry.name)
        set({ activeGalleryId: id })
        return true
      },

      clearActive: () => set({ activeGalleryId: null }),

      importEnvelope: (envelope) => {
        const now = new Date().toISOString()
        const id = createGalleryId()
        const entry: GalleryEntry = {
          id,
          name: envelope.name,
          createdAt: envelope.savedAt || now,
          updatedAt: now,
          thumbnailDataUrl: PLACEHOLDER_THUMBNAIL,
          project: cloneSnapshot(envelope.project),
        }
        set((state) => ({
          entries: [entry, ...state.entries],
        }))
        syncUp(entry, get().mode)
        return id
      },

      exportEntry: (id) => {
        const entry = get().entries.find((item) => item.id === id)
        if (!entry) return false
        downloadEntryJson(entry)
        return true
      },
    }),
    {
      name: GALLERY_STORAGE_KEY,
      version: GALLERY_STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Signed-in saves live in the account, so the browser copy is emptied —
      // this is what clears the local library after migrating it. The active id
      // still persists so a reload keeps writing to the same project instead of
      // creating a duplicate.
      partialize: (state): PersistedGalleryState => ({
        entries: state.mode === 'cloud' ? [] : state.entries,
        activeGalleryId: state.activeGalleryId,
      }),
      // v2: project snapshots may include per-project slots; older entries omit them.
      migrate: (persisted) => persisted as PersistedGalleryState,
    },
  ),
)

/**
 * Write the working draft into the gallery library.
 * Creates a new entry when none is active; otherwise updates the active one.
 * Skips empty drafts so "New" / cleared scenes do not create blank cards.
 */
export function persistDraftToGallery(): boolean {
  const { shapes, projectName } = useStrawMobileStore.getState()
  if (shapes.length === 0) return false

  const { activeGalleryId, entries, saveCurrent, updateActive } = useGalleryStore.getState()
  const activeEntry = activeGalleryId
    ? entries.find((entry) => entry.id === activeGalleryId)
    : undefined

  if (activeEntry) {
    updateActive()
    return true
  }

  saveCurrent(
    projectName.trim() || nextProjectName(entries.map((entry) => entry.name)),
  )
  return true
}
