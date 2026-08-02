import { useStrawMobileStore } from '../state/store'
import { getBodyRef } from './bodyRefRegistry'
import { computeRestingPositions } from './restingLayout'

/**
 * Bridges the UI (outside the Canvas) with the live physics bodies (inside
 * it). Stopping the simulation reads each shape's current translation/rotation
 * straight from Rapier and freezes it into the store before switching back to
 * build mode, so editing continues from wherever the mobile settled.
 */
export function useSimulationToggle() {
  const mode = useStrawMobileStore((s) => s.mode)

  const startSimulating = () => {
    const { shapes, connections, setShapeTransform, setMode } = useStrawMobileStore.getState()
    const restingPositions = computeRestingPositions(shapes, connections)
    for (const [shapeId, position] of restingPositions) {
      const shape = shapes.find((s) => s.id === shapeId)
      if (shape) setShapeTransform(shapeId, position, shape.quaternion)
    }
    setMode('simulate')
  }

  const stopSimulating = () => {
    const { shapes, setShapeTransform, setMode } = useStrawMobileStore.getState()
    for (const shape of shapes) {
      const body = getBodyRef(shape.id).current
      if (!body) continue
      const t = body.translation()
      const r = body.rotation()
      setShapeTransform(shape.id, [t.x, t.y, t.z], [r.x, r.y, r.z, r.w])
    }
    setMode('build')
  }

  return { mode, startSimulating, stopSimulating }
}
