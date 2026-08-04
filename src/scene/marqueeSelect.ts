import * as THREE from 'three'
import type { Shape } from '../state/types'
import { shapeWorldAabb } from './placement'

export type ScreenRect = {
  left: number
  top: number
  right: number
  bottom: number
}

const _corner = new THREE.Vector3()
const _ndc = new THREE.Vector3()

/** Normalize a drag into a positive screen-space rect (client coordinates). */
export function normalizeScreenRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): ScreenRect {
  return {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    right: Math.max(startX, endX),
    bottom: Math.max(startY, endY),
  }
}

function rectsIntersect(a: ScreenRect, b: ScreenRect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

/**
 * Project a shape's world AABB corners to a screen-space AABB in client pixels.
 * Returns null when every corner is behind the camera.
 */
export function shapeScreenAabb(
  shape: Shape,
  camera: THREE.Camera,
  canvasRect: DOMRect,
): ScreenRect | null {
  const { min, max } = shapeWorldAabb(shape)
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  let anyVisible = false

  for (let ix = 0; ix < 2; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      for (let iz = 0; iz < 2; iz++) {
        _corner.set(ix ? max.x : min.x, iy ? max.y : min.y, iz ? max.z : min.z)
        _ndc.copy(_corner).project(camera)
        if (_ndc.z < -1 || _ndc.z > 1) continue
        anyVisible = true
        const sx = canvasRect.left + ((_ndc.x + 1) / 2) * canvasRect.width
        const sy = canvasRect.top + ((1 - _ndc.y) / 2) * canvasRect.height
        left = Math.min(left, sx)
        right = Math.max(right, sx)
        top = Math.min(top, sy)
        bottom = Math.max(bottom, sy)
      }
    }
  }

  if (!anyVisible) return null
  return { left, top, right, bottom }
}

/** Free shapes whose projected screen AABB intersects the marquee rect. */
export function shapesIntersectingMarquee(
  shapes: Shape[],
  marquee: ScreenRect,
  camera: THREE.Camera,
  canvasRect: DOMRect,
): string[] {
  const hits: string[] = []
  for (const shape of shapes) {
    const screen = shapeScreenAabb(shape, camera, canvasRect)
    if (screen && rectsIntersect(marquee, screen)) {
      hits.push(shape.id)
    }
  }
  return hits
}

/** True when a raycast hit belongs to a free selectable shape group. */
export function hitSelectableShape(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object
  while (current) {
    if (typeof current.userData?.selectableShapeId === 'string') return true
    current = current.parent
  }
  return false
}

/** Set when a marquee drag finishes so empty-click deselect does not clear it. */
let marqueeConsumedClick = false

/** Mark that a marquee just completed (suppresses the following pointer-miss clear). */
export function markMarqueeClick(): void {
  marqueeConsumedClick = true
  // Clear on next frames so a synthetic click after pointerup still sees it.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      marqueeConsumedClick = false
    })
  })
}

/** True when the last canvas gesture was a completed marquee (not an empty miss). */
export function consumeMarqueeClick(): boolean {
  if (!marqueeConsumedClick) return false
  marqueeConsumedClick = false
  return true
}
