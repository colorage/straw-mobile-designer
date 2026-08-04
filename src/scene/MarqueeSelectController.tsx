import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { getHangingShapeIds } from '../physics/restingLayout'
import { useStrawMobileStore } from '../state/store'
import {
  hitSelectableShape,
  markMarqueeClick,
  normalizeScreenRect,
  shapesIntersectingMarquee,
} from './marqueeSelect'

const DRAG_THRESHOLD_PX = 5

type DragState = {
  pointerId: number
  startX: number
  startY: number
  shiftKey: boolean
  active: boolean
  overlay: HTMLDivElement | null
  orbitWasEnabled: boolean | null
}

/**
 * Select-mode rectangle selection: drag on empty canvas to marquee free shapes.
 * Single-click selection stays on shape bodies; empty click still clears via
 * Experience onPointerMissed (unless a marquee just completed).
 */
export function MarqueeSelectController() {
  const { camera, gl, scene, get } = useThree()

  useEffect(() => {
    const canvas = gl.domElement
    const host = canvas.parentElement

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let drag: DragState | null = null

    const getControls = () => get().controls as OrbitControlsImpl | null

    const hitsShapeAt = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(scene.children, true)
      return hits.some((hit) => hitSelectableShape(hit.object))
    }

    const removeOverlay = (state: DragState) => {
      state.overlay?.remove()
      state.overlay = null
    }

    const restoreOrbit = (state: DragState) => {
      if (state.orbitWasEnabled == null) return
      const controls = getControls()
      if (controls) controls.enabled = state.orbitWasEnabled
      state.orbitWasEnabled = null
    }

    const ensureOverlay = (state: DragState) => {
      if (state.overlay || !host) return
      const el = document.createElement('div')
      el.className = 'hud-marquee'
      el.setAttribute('aria-hidden', 'true')
      host.appendChild(el)
      state.overlay = el
    }

    const updateOverlay = (state: DragState, clientX: number, clientY: number) => {
      ensureOverlay(state)
      if (!state.overlay) return
      const hostRect = host?.getBoundingClientRect()
      if (!hostRect) return
      const rect = normalizeScreenRect(state.startX, state.startY, clientX, clientY)
      state.overlay.style.left = `${rect.left - hostRect.left}px`
      state.overlay.style.top = `${rect.top - hostRect.top}px`
      state.overlay.style.width = `${rect.right - rect.left}px`
      state.overlay.style.height = `${rect.bottom - rect.top}px`
    }

    const finishDrag = (state: DragState, clientX: number, clientY: number) => {
      removeOverlay(state)
      restoreOrbit(state)

      if (!state.active) {
        drag = null
        return
      }

      const store = useStrawMobileStore.getState()
      if (store.activeTool !== 'select') {
        drag = null
        return
      }

      const canvasRect = canvas.getBoundingClientRect()
      const marquee = normalizeScreenRect(state.startX, state.startY, clientX, clientY)
      const hangingIds = getHangingShapeIds(store.connections)
      const reelingIds = new Set(store.reelIns.map((reel) => reel.shapeId))
      const freeShapes = store.shapes.filter(
        (shape) => !hangingIds.has(shape.id) && !reelingIds.has(shape.id),
      )
      const hitIds = shapesIntersectingMarquee(freeShapes, marquee, camera, canvasRect)

      if (state.shiftKey) {
        const merged = [...store.selectedShapeIds]
        for (const id of hitIds) {
          if (!merged.includes(id)) merged.push(id)
        }
        store.selectShapes(merged)
      } else {
        store.selectShapes(hitIds)
      }

      markMarqueeClick()
      drag = null
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      if (useStrawMobileStore.getState().activeTool !== 'select') return
      if (hitsShapeAt(event.clientX, event.clientY)) return

      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        shiftKey: event.shiftKey,
        active: false,
        overlay: null,
        orbitWasEnabled: null,
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return

      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      if (!drag.active) {
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return

        // Gizmo / other capture may have disabled orbit already — abort marquee.
        const controls = getControls()
        if (controls && !controls.enabled) {
          drag = null
          return
        }

        drag.active = true
        drag.orbitWasEnabled = controls ? controls.enabled : null
        if (controls) controls.enabled = false
        try {
          canvas.setPointerCapture(event.pointerId)
        } catch {
          // Capture can fail if the pointer was already released.
        }
      }

      updateOverlay(drag, event.clientX, event.clientY)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      const state = drag
      try {
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId)
        }
      } catch {
        // Ignore release errors.
      }
      finishDrag(state, event.clientX, event.clientY)
    }

    const onPointerCancel = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      removeOverlay(drag)
      restoreOrbit(drag)
      drag = null
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)

    return () => {
      if (drag) {
        removeOverlay(drag)
        restoreOrbit(drag)
      }
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [camera, get, gl, scene])

  return null
}
