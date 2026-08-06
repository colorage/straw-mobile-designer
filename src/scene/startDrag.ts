import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { getBodyRef } from '../physics/bodyRefRegistry'
import { beginPhysicsGrab } from '../physics/physicsGrab'
import { getHangingShapeIds } from '../physics/restingLayout'
import { useStrawMobileStore } from '../state/store'
import type { Shape } from '../state/types'
import { getBridgeCamera, getBridgeCanvas } from './canvasBridge'
import {
  beginFreeMoveDrag,
  localGrabPoint,
  setMoveCursor,
  worldGrabFromStorePose,
} from './freeMoveDrag'

const _quat = new THREE.Quaternion()
const _planePoint = new THREE.Vector3()

/**
 * Begin free kinematic drag or hanging physics grab from a vertex/edge pointerdown.
 * Shared by free SelectableShape and hanging DrivenShapeVisual.
 */
export function startFreeOrHangDrag(
  shape: Shape,
  kind: 'vertex' | 'edge',
  vertexIndex: number | null,
  edgeIndex: number | null,
  event: ThreeEvent<PointerEvent>,
): void {
  const store = useStrawMobileStore.getState()
  if (store.isPreviewMode) return

  const camera = getBridgeCamera()
  const canvas = getBridgeCanvas()
  if (!camera || !canvas) return

  const { connections, reelIns, selectedEndpoint, selectedEdge } = store
  const hanging = getHangingShapeIds(connections)
  const reeling = (reelIns ?? []).some((reel) => reel.shapeId === shape.id)

  if (kind === 'vertex') {
    if (
      !selectedEndpoint ||
      selectedEndpoint.kind !== 'shape' ||
      selectedEndpoint.shapeId !== shape.id ||
      selectedEndpoint.vertexIndex !== vertexIndex
    ) {
      return
    }
  } else if (
    !selectedEdge ||
    selectedEdge.shapeId !== shape.id ||
    selectedEdge.edgeIndex !== edgeIndex
  ) {
    return
  }

  event.stopPropagation()
  const endpoint =
    kind === 'vertex' && vertexIndex !== null
      ? ({ kind: 'shape' as const, shapeId: shape.id, vertexIndex })
      : null
  const edge =
    kind === 'edge' && edgeIndex !== null ? { shapeId: shape.id, edgeIndex } : null
  const local = localGrabPoint(shape, endpoint, edge)

  _planePoint.copy(worldGrabFromStorePose(shape, local))

  if (hanging.has(shape.id) && !reeling) {
    const rapierBody = getBodyRef(shape.id).current
    if (rapierBody) {
      try {
        const t = rapierBody.translation()
        const r = rapierBody.rotation()
        _quat.set(r.x, r.y, r.z, r.w)
        _planePoint.set(local[0], local[1], local[2]).applyQuaternion(_quat)
        _planePoint.x += t.x
        _planePoint.y += t.y
        _planePoint.z += t.z
      } catch {
        // Keep store-based plane point.
      }
    }

    const started = beginPhysicsGrab({
      shapeId: shape.id,
      localAnchor: local,
      planePoint: _planePoint.clone(),
      clientX: event.nativeEvent.clientX,
      clientY: event.nativeEvent.clientY,
      camera,
      canvas,
    })
    if (started) setMoveCursor(true, true)
    return
  }

  if (hanging.has(shape.id) || reeling) return

  const started = beginFreeMoveDrag({
    kind,
    primaryShapeId: shape.id,
    planePoint: _planePoint.clone(),
    clientX: event.nativeEvent.clientX,
    clientY: event.nativeEvent.clientY,
    camera,
    canvas,
  })
  if (started) setMoveCursor(true, true)
}
