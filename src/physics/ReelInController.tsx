import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Vector3Tuple } from '../geometry/primitives'
import type { QuatTuple } from '../state/types'
import { useStrawMobileStore } from '../state/store'
import { getBodyRef } from './bodyRefRegistry'
import { driveMesh } from './meshDriveRegistry'
import { computeLiveReelClosePosition, easeOutCubic, reelInBodyKeys } from './reelIn'

/**
 * Drives in-progress thread reel-ins.
 *
 * Each interpolated pose is written into the kinematic body and into transient
 * `reelPositions` / `reelQuaternions` (RigidBody prop + DrivenShapeVisual).
 * `driveMesh` pushes the same pose to the plain visual group so the shorten is
 * visible the same frame. Persisted `shapes` only commit when the reel finishes.
 *
 * The finish target is refreshed from the live neighbor corner every frame so
 * a swinging hub doesn't leave a joint gap when several spokes join one corner.
 *
 * Runs at default useFrame priority (0). Physics uses updatePriority={-1} so
 * Rapier steps first; this callback then overwrites the visual. Do NOT pass a
 * positive priority — in R3F that disables automatic rendering unless the
 * subscriber calls gl.render() itself, which froze the production canvas.
 */
export function ReelInController() {
  useFrame(() => {
    const { reelIns, finishReelIns, setReelPoses, shapes, connections } =
      useStrawMobileStore.getState()
    const active = reelIns ?? []
    if (active.length === 0) return

    const now = performance.now()
    const completed: { shapeId: string; position: Vector3Tuple; quaternion: QuatTuple }[] = []
    const framePositions: Record<string, Vector3Tuple> = {}
    const frameQuaternions: Record<string, QuatTuple> = {}
    const reelingIds = reelInBodyKeys(active)

    const fromQ = new THREE.Quaternion()
    const toQ = new THREE.Quaternion()
    const outQ = new THREE.Quaternion()

    for (const reel of active) {
      const duration = Math.max(reel.durationMs, 1)
      const t = Math.min(1, (now - reel.startedAt) / duration)
      const e = easeOutCubic(t)

      fromQ.set(...reel.fromQuat)
      toQ.set(...reel.toQuat)
      outQ.copy(fromQ).slerp(toQ, e)
      const quaternion: QuatTuple = [outQ.x, outQ.y, outQ.z, outQ.w]

      // Free / first-hang: track a live non-reeling neighbor toward reel.to.
      // Hanging multi-pin (lockTarget): slerp orientation while pinning an
      // existing parent attachment to its live corner so parent joints — which
      // stay mounted — never accumulate a remount gap.
      let position: Vector3Tuple
      let liveTo: Vector3Tuple = reel.to
      if (reel.lockTarget) {
        const pinned = computeLiveReelClosePosition(
          reel.shapeId,
          shapes,
          connections,
          reelingIds,
          undefined,
          quaternion,
        )
        if (pinned) {
          position = pinned
          liveTo = pinned
        } else {
          position = [
            reel.from[0] + (reel.to[0] - reel.from[0]) * e,
            reel.from[1] + (reel.to[1] - reel.from[1]) * e,
            reel.from[2] + (reel.to[2] - reel.from[2]) * e,
          ]
          liveTo = position
        }
      } else {
        liveTo =
          computeLiveReelClosePosition(
            reel.shapeId,
            shapes,
            connections,
            reelingIds,
            reel.to,
            quaternion,
          ) ?? reel.to
        position = [
          reel.from[0] + (liveTo[0] - reel.from[0]) * e,
          reel.from[1] + (liveTo[1] - reel.from[1]) * e,
          reel.from[2] + (liveTo[2] - reel.from[2]) * e,
        ]
      }

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
        const finalPosition = liveTo
        const finalQuaternion = reel.toQuat
        // Zero leftover kinematic drive and snap to the live corner before the
        // body goes dynamic — otherwise multi-spoke hubs inherit a snap.
        if (body) {
          try {
            body.setLinvel({ x: 0, y: 0, z: 0 }, true)
            body.setAngvel({ x: 0, y: 0, z: 0 }, true)
            body.setTranslation(
              { x: finalPosition[0], y: finalPosition[1], z: finalPosition[2] },
              true,
            )
            body.setNextKinematicTranslation({
              x: finalPosition[0],
              y: finalPosition[1],
              z: finalPosition[2],
            })
            body.setRotation(
              {
                x: finalQuaternion[0],
                y: finalQuaternion[1],
                z: finalQuaternion[2],
                w: finalQuaternion[3],
              },
              true,
            )
            body.setNextKinematicRotation({
              x: finalQuaternion[0],
              y: finalQuaternion[1],
              z: finalQuaternion[2],
              w: finalQuaternion[3],
            })
          } catch {
            // Body may have been removed mid-animation.
          }
        }
        completed.push({
          shapeId: reel.shapeId,
          position: finalPosition,
          quaternion: finalQuaternion,
        })
      }
    }

    setReelPoses(framePositions, frameQuaternions)
    if (completed.length > 0) finishReelIns(completed)
  })

  return null
}
