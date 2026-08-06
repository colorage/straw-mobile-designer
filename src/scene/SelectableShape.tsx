import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useStrawMobileStore } from '../state/store'
import type { Shape } from '../state/types'
import { DRAG_GIZMO_USER_DATA } from './gizmoDrag'
import {
  beginFreeMoveDrag,
  selectionCentroid,
  setMoveCursor,
} from './freeMoveDrag'
import { ShapeGroup } from './ShapeGroup'
import { startFreeOrHangDrag } from './startDrag'
import { useSoftwareGL } from './renderCapability'

const CUBE_SIZE = 0.28
const CUBE_COLOR = '#8fb8ff'

interface SelectableShapeProps {
  shape: Shape
  isSelected: boolean
  /**
   * True when this free shape is the primary selection and should mount the
   * centroid cube (no vertex/straw subtarget).
   */
  showCentroidCube: boolean
  onVertexClick: (vertexIndex: number) => void
  isVertexPending: (vertexIndex: number) => boolean
  isVertexSuggested: (vertexIndex: number) => boolean
  isVertexConnected: (vertexIndex: number) => boolean
  isVertexMoveTarget: (vertexIndex: number) => boolean
  isEdgeMoveTarget: (edgeIndex: number) => boolean
  onEdgeSelect: (edgeIndex: number) => void
}

/**
 * Free workbench shape as a plain Three group (not a RigidBody child).
 *
 * Visuals live outside Rapier so newly added meshes never inherit a stale
 * identity matrixWorld. Pose changes sync into the matching kinematic body
 * so joints/colliders stay aligned.
 */
export function SelectableShape({
  shape,
  isSelected,
  showCentroidCube,
  onVertexClick,
  isVertexPending,
  isVertexSuggested,
  isVertexConnected,
  isVertexMoveTarget,
  isEdgeMoveTarget,
  onEdgeSelect,
}: SelectableShapeProps) {
  const selectShape = useStrawMobileStore((s) => s.selectShape)
  const toggleShapeSelection = useStrawMobileStore((s) => s.toggleShapeSelection)
  const removeShape = useStrawMobileStore((s) => s.removeShape)
  const cutAssemblyEdge = useStrawMobileStore((s) => s.cutAssemblyEdge)
  const activeTool = useStrawMobileStore((s) => s.activeTool)
  const isScissors = activeTool === 'scissors'
  const cutsPerStraw = isScissors && shape.kind === 'assembly'

  const handleBodyClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (isScissors) {
      if (!cutsPerStraw) removeShape(shape.id)
      return
    }
    if (activeTool !== 'select') return
    if (event.nativeEvent.shiftKey) {
      toggleShapeSelection(shape.id)
      return
    }
    selectShape(shape.id)
  }

  return (
    <>
      <group position={shape.position} quaternion={shape.quaternion}>
        <ShapeGroup
          shape={shape}
          interactive={activeTool !== 'scissors'}
          onVertexClick={onVertexClick}
          isVertexPending={isVertexPending}
          isVertexSuggested={isVertexSuggested}
          isVertexConnected={isVertexConnected}
          isVertexMoveTarget={isVertexMoveTarget}
          isEdgeMoveTarget={isEdgeMoveTarget}
          selected={isSelected}
          scissorsHover={isScissors}
          onBodyClick={handleBodyClick}
          onEdgeClick={
            cutsPerStraw
              ? (edgeIndex) => cutAssemblyEdge(shape.id, edgeIndex)
              : activeTool === 'select'
                ? onEdgeSelect
                : undefined
          }
          onVertexDragStart={
            activeTool === 'select'
              ? (vertexIndex, event) =>
                  startFreeOrHangDrag(shape, 'vertex', vertexIndex, null, event)
              : undefined
          }
          onEdgeDragStart={
            activeTool === 'select'
              ? (edgeIndex, event) => startFreeOrHangDrag(shape, 'edge', null, edgeIndex, event)
              : undefined
          }
        />
      </group>
      {showCentroidCube && activeTool === 'select' && <CentroidMoveCube shape={shape} />}
    </>
  )
}

function CentroidMoveCube({ shape }: { shape: Shape }) {
  const softwareGL = useSoftwareGL()
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const centroid = selectionCentroid(shape.position)

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    const planePoint = new THREE.Vector3(centroid[0], centroid[1], centroid[2])
    const started = beginFreeMoveDrag({
      kind: 'centroid',
      primaryShapeId: shape.id,
      planePoint,
      clientX: event.nativeEvent.clientX,
      clientY: event.nativeEvent.clientY,
      camera,
      canvas: gl.domElement,
    })
    if (started) setMoveCursor(true, true)
  }

  return (
    <mesh
      position={centroid}
      userData={DRAG_GIZMO_USER_DATA}
      onPointerDown={onPointerDown}
      onPointerOver={(event) => {
        event.stopPropagation()
        setMoveCursor(true)
      }}
      onPointerOut={() => {
        setMoveCursor(false)
      }}
      castShadow={!softwareGL}
    >
      <boxGeometry args={[CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]} />
      {softwareGL ? (
        <meshBasicMaterial color={CUBE_COLOR} toneMapped={false} />
      ) : (
        <meshStandardMaterial
          color={CUBE_COLOR}
          roughness={0.35}
          metalness={0.15}
          emissive={CUBE_COLOR}
          emissiveIntensity={0.25}
        />
      )}
    </mesh>
  )
}
