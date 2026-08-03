import {
  GALLERY_FILE_FORMAT,
  GALLERY_FILE_VERSION,
  type GalleryEntry,
  type GalleryFileEnvelope,
  type ProjectSnapshot,
} from './types'
import type { Connection, EndpointRef, Shape, StrawSize } from '../state/types'
import type { ShapeKind, Vector3Tuple } from '../geometry/primitives'

const SHAPE_KINDS = new Set<ShapeKind>(['straw', 'tetrahedron', 'squarePyramid', 'octahedron'])
const STRAW_SIZES = new Set<StrawSize>([1, 0.5, 0.25])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumberTuple3(value: unknown): value is Vector3Tuple {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

function isQuaternion(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

function isEndpointRef(value: unknown): value is EndpointRef {
  if (!isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'anchor') return true
  return (
    value.kind === 'shape' &&
    typeof value.shapeId === 'string' &&
    typeof value.vertexIndex === 'number' &&
    Number.isInteger(value.vertexIndex) &&
    value.vertexIndex >= 0
  )
}

function isShape(value: unknown): value is Shape {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string') return false
  if (typeof value.kind !== 'string' || !SHAPE_KINDS.has(value.kind as ShapeKind)) return false
  if (typeof value.size !== 'number' || !STRAW_SIZES.has(value.size as StrawSize)) return false
  if (!Array.isArray(value.vertices) || !value.vertices.every(isNumberTuple3)) return false
  if (
    !Array.isArray(value.edges) ||
    !value.edges.every(
      (edge) =>
        Array.isArray(edge) &&
        edge.length === 2 &&
        typeof edge[0] === 'number' &&
        typeof edge[1] === 'number',
    )
  ) {
    return false
  }
  return isNumberTuple3(value.position) && isQuaternion(value.quaternion)
}

function isConnection(value: unknown): value is Connection {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isEndpointRef(value.a) &&
    isEndpointRef(value.b)
  )
}

function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  if (!isRecord(value)) return false
  if (typeof value.strawSize !== 'number' || !STRAW_SIZES.has(value.strawSize as StrawSize)) {
    return false
  }
  if (!Array.isArray(value.shapes) || !value.shapes.every(isShape)) return false
  if (!Array.isArray(value.connections) || !value.connections.every(isConnection)) return false
  return true
}

/** Build the versioned JSON envelope for downloading a gallery entry. */
export function serializeEntry(entry: GalleryEntry): GalleryFileEnvelope {
  return {
    format: GALLERY_FILE_FORMAT,
    version: GALLERY_FILE_VERSION,
    name: entry.name,
    savedAt: entry.updatedAt,
    project: entry.project,
  }
}

/**
 * Parse and validate an imported gallery JSON file.
 * Throws with a user-facing message when the file is not a valid envelope.
 */
export function parseImportFile(raw: unknown): GalleryFileEnvelope {
  if (!isRecord(raw)) {
    throw new Error('This file is not a valid straw mobile JSON export.')
  }
  if (raw.format !== GALLERY_FILE_FORMAT) {
    throw new Error('This file is not a straw mobile designer export.')
  }
  if (raw.version !== GALLERY_FILE_VERSION) {
    throw new Error(`Unsupported export version (${String(raw.version)}).`)
  }
  if (typeof raw.name !== 'string' || raw.name.trim() === '') {
    throw new Error('Export is missing a name.')
  }
  if (typeof raw.savedAt !== 'string') {
    throw new Error('Export is missing a saved date.')
  }
  if (!isProjectSnapshot(raw.project)) {
    throw new Error('Export project data is missing or invalid.')
  }
  return {
    format: GALLERY_FILE_FORMAT,
    version: GALLERY_FILE_VERSION,
    name: raw.name.trim(),
    savedAt: raw.savedAt,
    project: raw.project,
  }
}

/** Trigger a browser download of a gallery entry as JSON. */
export function downloadEntryJson(entry: GalleryEntry): void {
  const envelope = serializeEntry(entry)
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const safeName = entry.name
    .trim()
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  anchor.href = url
  anchor.download = `${safeName || 'straw-mobile'}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Read a File as JSON and validate it as a gallery export. */
export async function readGalleryFile(file: File): Promise<GalleryFileEnvelope> {
  const text = await file.text()
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    throw new Error('Could not parse JSON from this file.')
  }
  return parseImportFile(raw)
}
