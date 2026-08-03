/**
 * Quick verification that three free straws form a tightened triangle
 * (not a stacked overlap) after the third connection.
 *
 * Run: npx tsx scripts/verify-free-cluster.ts
 */
import * as THREE from 'three'
import { straw } from '../src/geometry/primitives'
import { computeFreeClusterLayout } from '../src/physics/freeClusterLayout'
import { getScaledVertex } from '../src/state/shapeSpace'
import type { Connection, Shape } from '../src/state/types'

function makeStraw(id: string, position: [number, number, number]): Shape {
  const geom = straw()
  return {
    id,
    kind: 'straw',
    size: 1,
    vertices: geom.vertices,
    edges: geom.edges,
    position,
    quaternion: [0, 0, 0, 1],
  }
}

function worldCorner(
  shape: Shape,
  vertexIndex: number,
  pose: { position: [number, number, number]; quaternion: [number, number, number, number] },
): THREE.Vector3 {
  const [x, y, z] = getScaledVertex(shape, vertexIndex)
  return new THREE.Vector3(x, y, z)
    .applyQuaternion(new THREE.Quaternion(...pose.quaternion))
    .add(new THREE.Vector3(...pose.position))
}

function jointError(
  shapesById: Map<string, Shape>,
  poses: Map<string, { position: [number, number, number]; quaternion: [number, number, number, number] }>,
  a: { shapeId: string; vertexIndex: number },
  b: { shapeId: string; vertexIndex: number },
): number {
  const sa = shapesById.get(a.shapeId)!
  const sb = shapesById.get(b.shapeId)!
  const pa = poses.get(a.shapeId)!
  const pb = poses.get(b.shapeId)!
  return worldCorner(sa, a.vertexIndex, pa).distanceTo(worldCorner(sb, b.vertexIndex, pb))
}

function midpoints(
  shapesById: Map<string, Shape>,
  poses: Map<string, { position: [number, number, number]; quaternion: [number, number, number, number] }>,
): THREE.Vector3[] {
  const mids: THREE.Vector3[] = []
  for (const [id, pose] of poses) {
    const shape = shapesById.get(id)!
    const c0 = worldCorner(shape, 0, pose)
    const c1 = worldCorner(shape, 1, pose)
    mids.push(c0.clone().add(c1).multiplyScalar(0.5))
  }
  return mids
}

// --- Two-straw single tie: should only translate, no spin ---
{
  let shapes = [makeStraw('a', [0, 0, 0]), makeStraw('b', [2, 0, 0])]
  const conn1: Connection = {
    id: 'c1',
    a: { kind: 'shape', shapeId: 'a', vertexIndex: 0 },
    b: { kind: 'shape', shapeId: 'b', vertexIndex: 0 },
  }
  const targets = computeFreeClusterLayout(shapes, [conn1], conn1)
  const bPose = targets.get('b')
  if (!bPose) throw new Error('two-straw: expected b to move')
  const angle = 2 * Math.acos(Math.min(1, Math.abs(bPose.quaternion[3])))
  if (angle > 1e-6) throw new Error(`two-straw: unexpected rotation ${angle}`)
  const err = jointError(
    new Map(shapes.map((s) => [s.id, s])),
    new Map([
      ['a', { position: shapes[0].position, quaternion: shapes[0].quaternion }],
      ['b', bPose],
    ]),
    { shapeId: 'a', vertexIndex: 0 },
    { shapeId: 'b', vertexIndex: 0 },
  )
  if (err > 1e-4) throw new Error(`two-straw: joint error ${err}`)
  console.log('ok: two-straw single tie (translate only, joint closed)')
}

// --- Three-straw triangle ---
{
  let shapes: Shape[] = [
    makeStraw('a', [0, 0, 0]),
    makeStraw('b', [1.5, 0, 0]),
    makeStraw('c', [3, 0, 0]),
  ]
  const conn1: Connection = {
    id: 'c1',
    a: { kind: 'shape', shapeId: 'a', vertexIndex: 0 },
    b: { kind: 'shape', shapeId: 'b', vertexIndex: 0 },
  }
  const conn2: Connection = {
    id: 'c2',
    a: { kind: 'shape', shapeId: 'b', vertexIndex: 1 },
    b: { kind: 'shape', shapeId: 'c', vertexIndex: 0 },
  }
  const conn3: Connection = {
    id: 'c3',
    a: { kind: 'shape', shapeId: 'c', vertexIndex: 1 },
    b: { kind: 'shape', shapeId: 'a', vertexIndex: 1 },
  }

  // Apply first two ties (simple closes), then third (cluster solve).
  for (const conn of [conn1, conn2]) {
    const connections = conn === conn1 ? [conn1] : [conn1, conn2]
    const targets = computeFreeClusterLayout(shapes, connections, conn)
    shapes = shapes.map((shape) => {
      const pose = targets.get(shape.id)
      return pose ? { ...shape, position: pose.position, quaternion: pose.quaternion } : shape
    })
  }

  const connections = [conn1, conn2, conn3]
  const targets = computeFreeClusterLayout(shapes, connections, conn3)
  shapes = shapes.map((shape) => {
    const pose = targets.get(shape.id)
    return pose ? { ...shape, position: pose.position, quaternion: pose.quaternion } : shape
  })

  const shapesById = new Map(shapes.map((s) => [s.id, s]))
  const poses = new Map(
    shapes.map((s) => [s.id, { position: s.position, quaternion: s.quaternion }] as const),
  )

  const e1 = jointError(shapesById, poses, { shapeId: 'a', vertexIndex: 0 }, { shapeId: 'b', vertexIndex: 0 })
  const e2 = jointError(shapesById, poses, { shapeId: 'b', vertexIndex: 1 }, { shapeId: 'c', vertexIndex: 0 })
  const e3 = jointError(shapesById, poses, { shapeId: 'c', vertexIndex: 1 }, { shapeId: 'a', vertexIndex: 1 })
  console.log('joint errors:', e1.toFixed(5), e2.toFixed(5), e3.toFixed(5))
  if (e1 > 0.05 || e2 > 0.05 || e3 > 0.05) {
    throw new Error(`triangle: joints not closed (${e1}, ${e2}, ${e3})`)
  }

  const mids = midpoints(shapesById, poses)
  const d01 = mids[0].distanceTo(mids[1])
  const d12 = mids[1].distanceTo(mids[2])
  const d20 = mids[2].distanceTo(mids[0])
  console.log('midpoint distances:', d01.toFixed(3), d12.toFixed(3), d20.toFixed(3))
  // Stacked/overlapping straws would have ~0 midpoint separation; a triangle needs spread.
  if (d01 < 0.3 || d12 < 0.3 || d20 < 0.3) {
    throw new Error(`triangle: straws still overlapping (mids ${d01}, ${d12}, ${d20})`)
  }

  // Triangle vertices are the three joint meeting points:
  const j0 = worldCorner(shapesById.get('a')!, 0, poses.get('a')!)
  const j1 = worldCorner(shapesById.get('b')!, 1, poses.get('b')!)
  const j2 = worldCorner(shapesById.get('c')!, 1, poses.get('c')!)
  const side01 = j0.distanceTo(j1)
  const side12 = j1.distanceTo(j2)
  const side20 = j2.distanceTo(j0)
  console.log('triangle sides:', side01.toFixed(3), side12.toFixed(3), side20.toFixed(3))
  const expected = 1.4
  for (const side of [side01, side12, side20]) {
    if (Math.abs(side - expected) > 0.15) {
      throw new Error(`triangle: side ${side} not near straw length ${expected}`)
    }
  }

  console.log('ok: three-straw triangle formed')
}

console.log('all free-cluster checks passed')
