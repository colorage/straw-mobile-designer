import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { PivotControls } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import {
  Raycaster,
  Sphere,
  Vector2,
  Vector3,
  type Camera,
  type Mesh,
  type Object3D,
} from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import { getBodyRef } from '../physics/bodyRefRegistry'
import { getFreeComponentIds, getHangingShapeIds } from '../physics/restingLayout'
import { useStrawMobileStore } from '../state/store'
import type { Shape } from '../state/types'
import { ShapeGroup } from './ShapeGroup'

/**
 * PivotControls axis hit volumes are invisible cylinders (no material — Three's
 * Mesh.raycast skips them). Ignore PlaneGeometry so ground/other planes cannot
 * keep the grab cursor stuck across the canvas.
 */
function isGizmoHitMesh(obj: Object3D): obj is Mesh {
  if (!(obj as Mesh).isMesh) return false
  return (obj as Mesh).geometry?.type === 'CylinderGeometry' && obj.visible === false
}

function collectGizmoHitMeshes(scene: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  scene.traverse((obj) => {
    if (isGizmoHitMesh(obj)) meshes.push(obj)
  })
  return meshes
}

const _sphere = new Sphere()
const _hitPoint = new Vector3()
const _centerNdc = new Vector3()
const _edgeWorld = new Vector3()
const _edgeNdc = new Vector3()
const _axisDir = new Vector3()

/**
 * True when the pointer is over a gizmo handle.
 * Prefer screen-space distance (PivotControls `fixed` keeps handles ~constant
 * pixel size). Fall back to a world-space sphere test.
 */
function pointerHitsGizmoMesh(
  raycaster: Raycaster,
  mesh: Mesh,
  pointerNdc: Vector2,
  camera: Camera,
): boolean {
  const geometry = mesh.geometry
  if (!geometry) return false
  if (!geometry.boundingSphere) geometry.computeBoundingSphere()
  if (!geometry.boundingSphere) return false

  mesh.updateWorldMatrix(true, false)
  _sphere.copy(geometry.boundingSphere).applyMatrix4(mesh.matrixWorld)
  _sphere.radius *= 1.5

  // Screen-space: project sphere center + a radius offset, compare to pointer.
  _centerNdc.copy(_sphere.center).project(camera)
  _axisDir.set(1, 0, 0).transformDirection(mesh.matrixWorld).normalize()
  _edgeWorld.copy(_sphere.center).addScaledVector(_axisDir, _sphere.radius)
  _edgeNdc.copy(_edgeWorld).project(camera)
  const radiusNdc = Math.hypot(_edgeNdc.x - _centerNdc.x, _edgeNdc.y - _centerNdc.y)
  // Minimum ~28px-equivalent in NDC so thin fixed handles stay easy to hit.
  const hitRadius = Math.max(radiusNdc * 1.25, 0.045)
  if (Math.hypot(pointerNdc.x - _centerNdc.x, pointerNdc.y - _centerNdc.y) <= hitRadius) {
    return true
  }

  return raycaster.ray.intersectSphere(_sphere, _hitPoint) !== null
}

/**
 * Shows grab over translation gizmo handles (grabbing while dragged).
 * PivotControls has no cursor API; axis hit meshes also lack materials so
 * Mesh.raycast misses them — we test projected handle spheres instead.
 *
 * Hit meshes are collected from the scene (invisible axis cylinders are unique
 * to PivotControls) because drei's internal groups are not always reachable
 * via a wrapper ref in the same layout pass.
 */
function useDragGizmoCursor() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const get = useThree((s) => s.get)
  const hitMeshesRef = useRef<Mesh[]>([])
  const hoveringRef = useRef(false)
  const draggingRef = useRef(false)
  const pointerNdc = useRef(new Vector2())
  const raycaster = useRef(new Raycaster()).current

  useLayoutEffect(() => {
    const collect = () => {
      hitMeshesRef.current = collectGizmoHitMeshes(scene)
      if (import.meta.env.DEV) {
        const debug = (window as unknown as { __strawDebug?: Record<string, unknown> }).__strawDebug
        if (debug) debug.gizmoHitCount = hitMeshesRef.current.length
      }
    }
    collect()
    const id = requestAnimationFrame(collect)
    return () => cancelAnimationFrame(id)
  })

  useEffect(() => {
    const canvas = gl.domElement

    const setCursor = (cursor: string) => {
      document.body.style.cursor = cursor
      canvas.style.cursor = cursor
    }

    const onPointerMove = (event: PointerEvent) => {
      if (draggingRef.current) {
        setCursor('grabbing')
        return
      }

      // Refresh in case the gizmo mounted after this listener did.
      hitMeshesRef.current = collectGizmoHitMeshes(scene)
      if (hitMeshesRef.current.length === 0) return

      const { camera } = get()
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      pointerNdc.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointerNdc.current, camera)

      let overGizmo = false
      for (const mesh of hitMeshesRef.current) {
        if (pointerHitsGizmoMesh(raycaster, mesh, pointerNdc.current, camera)) {
          overGizmo = true
          break
        }
      }

      if (overGizmo) {
        hoveringRef.current = true
        setCursor('grab')
      } else if (hoveringRef.current) {
        hoveringRef.current = false
        setCursor('')
      }
    }

    const onPointerLeave = () => {
      if (draggingRef.current) return
      if (hoveringRef.current) {
        hoveringRef.current = false
        setCursor('')
      }
    }

    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerleave', onPointerLeave)
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      if (hoveringRef.current || draggingRef.current) {
        hoveringRef.current = false
        draggingRef.current = false
        setCursor('')
      }
    }
  }, [gl, get, raycaster, scene])

  return {
    beginDrag() {
      draggingRef.current = true
      document.body.style.cursor = 'grabbing'
      gl.domElement.style.cursor = 'grabbing'
    },
    endDrag() {
      draggingRef.current = false
      const next = hoveringRef.current ? 'grab' : ''
      document.body.style.cursor = next
      gl.domElement.style.cursor = next
    },
  }
}

interface SelectableShapeProps {
  shape: Shape
  isSelected: boolean
  /** Only the primary (last) selected free shape mounts the drag gizmo. */
  showGizmo: boolean
  onVertexClick: (vertexIndex: number) => void
  isVertexPending: (vertexIndex: number) => boolean
  isVertexSuggested: (vertexIndex: number) => boolean
  isVertexConnected: (vertexIndex: number) => boolean
}

/**
 * Free workbench shape as a plain Three group (not a RigidBody child).
 *
 * Visuals and PivotControls live outside Rapier so newly added meshes never
 * inherit a stale identity matrixWorld. Pose changes sync into the matching
 * kinematic body so joints/colliders stay aligned.
 */
export function SelectableShape({
  shape,
  isSelected,
  showGizmo,
  onVertexClick,
  isVertexPending,
  isVertexSuggested,
  isVertexConnected,
}: SelectableShapeProps) {
  const selectShape = useStrawMobileStore((s) => s.selectShape)
  const toggleShapeSelection = useStrawMobileStore((s) => s.toggleShapeSelection)
  const removeShape = useStrawMobileStore((s) => s.removeShape)
  const activeTool = useStrawMobileStore((s) => s.activeTool)
  // Remount the gizmo when the selection set changes so frozen offset refreshes.
  const selectionKey = useStrawMobileStore((s) => s.selectedShapeIds.join('|'))
  const isScissors = activeTool === 'scissors'

  const handleBodyClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (isScissors) {
      removeShape(shape.id)
      return
    }
    if (activeTool !== 'select') return
    if (event.nativeEvent.shiftKey) {
      toggleShapeSelection(shape.id)
      return
    }
    selectShape(shape.id)
  }

  const shapeGroup = (
    <ShapeGroup
      shape={shape}
      interactive={activeTool !== 'scissors'}
      onVertexClick={onVertexClick}
      isVertexPending={isVertexPending}
      isVertexSuggested={isVertexSuggested}
      isVertexConnected={isVertexConnected}
      selected={isSelected}
      scissorsHover={isScissors}
      onBodyClick={handleBodyClick}
    />
  )

  if (!showGizmo || activeTool !== 'select') {
    return (
      <group position={shape.position} quaternion={shape.quaternion}>
        {shapeGroup}
      </group>
    )
  }

  return (
    <DragGizmo
      key={selectionKey}
      shapeId={shape.id}
      position={shape.position}
      quaternion={shape.quaternion}
    >
      {shapeGroup}
    </DragGizmo>
  )
}

interface DragGizmoProps {
  shapeId: string
  position: Vector3Tuple
  quaternion: [number, number, number, number]
  children: ReactNode
}

function syncKinematicBody(shapeId: string, position: Vector3Tuple) {
  const body = getBodyRef(shapeId).current
  if (!body) return
  try {
    body.wakeUp()
    body.setNextKinematicTranslation({ x: position[0], y: position[1], z: position[2] })
    body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true)
  } catch {
    // Body may have been removed mid-drag.
  }
}

/** World-space centroid of currently selected free shapes (fallback: primary). */
function selectionCentroid(primaryPosition: Vector3Tuple): Vector3Tuple {
  const { shapes, selectedShapeIds, connections } = useStrawMobileStore.getState()
  const hanging = getHangingShapeIds(connections)
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))

  let sx = 0
  let sy = 0
  let sz = 0
  let n = 0
  for (const id of selectedShapeIds) {
    if (hanging.has(id)) continue
    const shape = shapesById.get(id)
    if (!shape) continue
    sx += shape.position[0]
    sy += shape.position[1]
    sz += shape.position[2]
    n += 1
  }
  if (n === 0) return primaryPosition
  return [sx / n, sy / n, sz / n]
}

/**
 * Free selected shapes plus free thread-connected neighbors (not hanging).
 * Snapshot positions at drag start so every cohort member shares one delta.
 */
function snapshotDragCohortBases(): Map<string, Vector3Tuple> {
  const { shapes, connections, selectedShapeIds } = useStrawMobileStore.getState()
  const hanging = getHangingShapeIds(connections)
  const shapeById = new Map(shapes.map((shape) => [shape.id, shape]))
  const cohortIds = new Set<string>()

  for (const seedId of selectedShapeIds) {
    if (!shapeById.has(seedId) || hanging.has(seedId)) continue
    for (const id of getFreeComponentIds(connections, seedId)) {
      if (!shapeById.has(id) || hanging.has(id)) continue
      cohortIds.add(id)
    }
  }

  // Primary gizmo target is always included even if selection was cleared mid-gesture.
  const bases = new Map<string, Vector3Tuple>()
  for (const id of cohortIds) {
    const shape = shapeById.get(id)
    if (!shape) continue
    bases.set(id, [...shape.position] as Vector3Tuple)
  }
  return bases
}

/**
 * Translate-only PivotControls gizmo.
 *
 * Freezes position/quaternion at mount (selection time) for the inner group.
 * PivotControls sits untransformed under the scene root; `offset` places the
 * handles at the selection centroid. onDrag matrix `l` is the accumulated
 * world-space translation since mount — adding that to each snapshotted cohort
 * base gives live store positions without double-counting the drag delta that
 * PivotControls already applies imperatively to its subtree.
 */
function DragGizmo({ shapeId, position, quaternion, children }: DragGizmoProps) {
  const moveShapes = useStrawMobileStore((s) => s.moveShapes)
  const pushHistory = useStrawMobileStore((s) => s.pushHistory)
  const basePosition = useRef(position).current
  const baseQuaternion = useRef(quaternion).current
  const offset = useRef(selectionCentroid(position)).current
  const cohortBasesRef = useRef<Map<string, Vector3Tuple>>(new Map())
  const cursor = useDragGizmoCursor()

  return (
    <PivotControls
      disableRotations
      disableScaling
      scale={3.6}
      lineWidth={2.5}
      fixed
      depthTest={false}
      offset={offset}
      onDragStart={() => {
        cursor.beginDrag()
        // One history entry per drag gesture — not per onDrag frame.
        pushHistory()
        const bases = snapshotDragCohortBases()
        // Ensure the gizmo owner is in the cohort even if selection drifted.
        if (!bases.has(shapeId)) {
          bases.set(shapeId, [...basePosition] as Vector3Tuple)
        }
        cohortBasesRef.current = bases
      }}
      onDrag={(l) => {
        // `l` is translation since gizmo mount (same as primary basePosition).
        // Cohort siblings were snapshotted at drag start from the store, so
        // apply the primary's gesture delta rather than the raw mount offset.
        const primaryNext: Vector3Tuple = [
          basePosition[0] + l.elements[12],
          basePosition[1] + l.elements[13],
          basePosition[2] + l.elements[14],
        ]
        const bases = cohortBasesRef.current
        const primaryBase = bases.get(shapeId) ?? basePosition
        const gestureDx = primaryNext[0] - primaryBase[0]
        const gestureDy = primaryNext[1] - primaryBase[1]
        const gestureDz = primaryNext[2] - primaryBase[2]

        const updates: { id: string; position: Vector3Tuple }[] = []
        for (const [id, base] of bases) {
          const next: Vector3Tuple =
            id === shapeId
              ? primaryNext
              : [base[0] + gestureDx, base[1] + gestureDy, base[2] + gestureDz]
          updates.push({ id, position: next })
          syncKinematicBody(id, next)
        }
        moveShapes(updates)
      }}
      onDragEnd={() => {
        cursor.endDrag()
      }}
    >
      <group position={basePosition} quaternion={baseQuaternion}>
        {children}
      </group>
    </PivotControls>
  )
}
