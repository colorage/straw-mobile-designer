import type * as THREE from 'three'

/** True while a camera-plane / physics grab gesture is in progress. */
let gizmoDragging = false

/** Set when a move drag ends so empty-click deselect does not exit select mode. */
let gizmoConsumedClick = false

/** Call when an object-move drag starts (centroid cube, corner, or straw). */
export function beginGizmoDrag(): void {
  gizmoDragging = true
}

/** Call when an object-move drag ends — keeps select mode through the following miss. */
export function endGizmoDrag(): void {
  gizmoDragging = false
  gizmoConsumedClick = true
  // Clear on next frames so a synthetic click after pointerup still sees it.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      gizmoConsumedClick = false
    })
  })
}

export function isGizmoDragging(): boolean {
  return gizmoDragging
}

/**
 * True during or just after a move drag. Used so marquee finish does not
 * replace selection when onDragEnd cleared the dragging flag first.
 */
export function shouldIgnoreMarquee(): boolean {
  return gizmoDragging || gizmoConsumedClick
}

/** True when the last canvas gesture was a completed move drag (not an empty miss). */
export function consumeGizmoClick(): boolean {
  if (!gizmoConsumedClick) return false
  gizmoConsumedClick = false
  return true
}

/** userData key applied to move-handle hit meshes (centroid cube). */
export const DRAG_GIZMO_USER_DATA = { dragGizmo: true } as const

/** True when a raycast hit belongs to a drag gizmo handle. */
export function hitDragGizmo(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object
  while (current) {
    if (current.userData?.dragGizmo === true) return true
    current = current.parent
  }
  return false
}
