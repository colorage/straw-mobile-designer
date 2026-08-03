import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import type { QuatTuple } from '../state/types'
import { useStrawMobileStore } from '../state/store'
import { getBodyRef } from './bodyRefRegistry'
import { driveMesh } from './meshDriveRegistry'
import { easeOutCubic } from './reelIn'

/**
 * Drives in-progress thread reel-ins.
 *
 * Each interpolated pose is written into the kinematic body and into transient
 * `reelPositions` / `reelQuaternions` (RigidBody prop + DrivenShapeVisual).
 * `driveMesh` pushes the same pose to the plain visual group so the shorten is
 * visible the same frame. Persisted `shapes` only commit when the reel finishes.
 *
 * Runs at default useFrame priority (0). Physics uses updatePriority={-1} so
 * Rapier steps first; this callback then overwrites the visual. Do NOT pass a
 * positive priority — in R3F that disables automatic rendering unless the
 * subscriber calls gl.render() itself, which froze the production canvas.
 */
export function ReelInController() {
  useFrame(() => {
    const { reelIns, finishReelIns, setReelPoses } = useStrawMobileStore.getState()
    const active = reelIns ?? []
    if (active.length === 0) return

    const now = performance.now()
    const completed: { shapeId: string; position: Vector3Tuple; quaternion: QuatTuple }[] = []
    const framePositions: Record<string, Vector3Tuple> = {}
    const frameQuaternions: Record<string, QuatTuple> = {}

    const fromQ = new THREE.Quaternion()
    const toQ = new THREE.Quaternion()
    const outQ = new THREE.Quaternion()

    for (const reel of active) {
      const duration = Math.max(reel.durationMs, 1)
      const t = Math.min(1, (now - reel.startedAt) / duration)
      const e = easeOutCubic(t)
      const position: Vector3Tuple = [
        reel.from[0] + (reel.to[0] - reel.from[0]) * e,
        reel.from[1] + (reel.to[1] - reel.from[1]) * e,
        reel.from[2] + (reel.to[2] - reel.from[2]) * e,
      ]
      fromQ.set(...reel.fromQuat)
      toQ.set(...reel.toQuat)
      outQ.copy(fromQ).slerp(toQ, e)
      const quaternion: QuatTuple = [outQ.x, outQ.y, outQ.z, outQ.w]

      framePositions[reel.shapeId] = position
      frameQuaternions[reel.shapeId] = quaternion

      const body = getBodyRef(reel.shapeId).current
      if (body) {
        try {
          body.wakeUp()
          body.setNextKinematicTranslation({
            x: position[0],
            y: position[1],
            z: position[2],
          })
          body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true)
          body.setNextKinematicRotation({
            x: quaternion[0],
            y: quaternion[1],
            z: quaternion[2],
            w: quaternion[3],
          })
          body.setRotation(
            { x: quaternion[0], y: quaternion[1], z: quaternion[2], w: quaternion[3] },
            true,
          )
        } catch {
          // Body may have been removed mid-animation.
        }
      }

      // Imperative mesh write after physics sync so the shorten is visible.
      driveMesh(reel.shapeId, position, quaternion)

      if (t >= 1) {
        completed.push({ shapeId: reel.shapeId, position: reel.to, quaternion: reel.toQuat })
      }
    }

    setReelPoses(framePositions, frameQuaternions)
    if (completed.length > 0) finishReelIns(completed)
  })

  return null
}
