import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { syncShapeTransformsFromPhysics } from '../physics/syncTransforms'
import { captureCanvasThumbnail } from '../scene/canvasBridge'
import { useStrawMobileStore } from '../state/store'
import { createGalleryId } from './ids'
import { downloadEntryJson } from './jsonIo'
import type { GalleryEntry, GalleryFileEnvelope, ProjectSnapshot } from './types'

const GALLERY_STORAGE_KEY = 'straw-mobile-designer/gallery'
const GALLERY_STORAGE_VERSION = 1

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
  const { shapes, connections, strawSize } = useStrawMobileStore.getState()
  return cloneSnapshot({ shapes, connections, strawSize })
}

function captureSnapshotForSave(): { project: ProjectSnapshot; thumbnailDataUrl: string } {
  syncShapeTransformsFromPhysics()
  const project = readDraftSnapshot()
  const thumbnailDataUrl = captureCanvasThumbnail() ?? PLACEHOLDER_THUMBNAIL
  return { project, thumbnailDataUrl }
}

interface GalleryState {
  entries: GalleryEntry[]
  /** Gallery entry currently loaded into the editor, if any. */
  activeGalleryId: string | null

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

export const useGalleryStore = create<GalleryState>()(
  persist(
    (set, get) => ({
      entries: [],
      activeGalleryId: null,

      saveCurrent: (name) => {
        const trimmed = name.trim() || 'Untitled mobile'
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
        set((state) => ({
          entries: state.entries.map((entry) =>
            entry.id === activeGalleryId
              ? { ...entry, name: draftName, project, thumbnailDataUrl, updatedAt: now }
              : entry,
          ),
        }))
        return true
      },

      renameEntry: (id, name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        set((state) => ({
          entries: state.entries.map((entry) =>
            entry.id === id ? { ...entry, name: trimmed, updatedAt: new Date().toISOString() } : entry,
          ),
        }))
      },

      deleteEntry: (id) => {
        set((state) => ({
          entries: state.entries.filter((entry) => entry.id !== id),
          activeGalleryId: state.activeGalleryId === id ? null : state.activeGalleryId,
        }))
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
      partialize: (state): PersistedGalleryState => ({
        entries: state.entries,
        activeGalleryId: state.activeGalleryId,
      }),
    },
  ),
)
