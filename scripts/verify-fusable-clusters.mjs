/**
 * Quick checks for fuse-cluster detection (triangle tets yes, square hinges no).
 * Run: node scripts/verify-fusable-clusters.mjs
 *
 * Mirrors src/physics/rigidClusters.ts so CI / local checks stay dependency-free.
 */

const MIN_LOOP_PINS = 3
const FUSABLE_PANEL_KINDS = new Set(['straw', 'triangle', 'assembly'])

function endpointBodyKey(endpoint) {
  return endpoint.kind === 'anchor' ? 'anchor' : endpoint.shapeId
}

function endpointVertexKey(endpoint) {
  return endpoint.kind === 'anchor' ? 'anchor' : `${endpoint.shapeId}:${endpoint.vertexIndex}`
}

function findCycleConnectionIds(connections) {
  const adjacency = new Map()
  const shapeConnectionIds = []

  const addEdge = (from, to, connectionId, edgeUid) => {
    const list = adjacency.get(from) ?? []
    list.push({ to, connectionId, edgeUid })
    adjacency.set(from, list)
  }

  for (const connection of connections) {
    if (connection.a.kind === 'anchor' || connection.b.kind === 'anchor') continue
    const a = endpointBodyKey(connection.a)
    const b = endpointBodyKey(connection.b)
    if (a === b) continue
    shapeConnectionIds.push(connection.id)
    addEdge(a, b, connection.id, `${connection.id}:a`)
    addEdge(b, a, connection.id, `${connection.id}:b`)
  }

  const cycleIds = new Set(shapeConnectionIds)
  if (cycleIds.size === 0) return cycleIds

  const disc = new Map()
  const low = new Map()
  let timer = 0

  for (const root of adjacency.keys()) {
    if (disc.has(root)) continue

    const stack = [{ node: root, parentEdgeUid: null, parentConnectionId: null, nextIndex: 0 }]
    timer += 1
    disc.set(root, timer)
    low.set(root, timer)

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      const edges = adjacency.get(frame.node) ?? []

      if (frame.nextIndex >= edges.length) {
        stack.pop()
        const parent = stack[stack.length - 1]
        if (parent) {
          low.set(parent.node, Math.min(low.get(parent.node), low.get(frame.node)))
          if (frame.parentConnectionId && low.get(frame.node) > disc.get(parent.node)) {
            cycleIds.delete(frame.parentConnectionId)
          }
        }
        continue
      }

      const edge = edges[frame.nextIndex]
      frame.nextIndex += 1

      const mateUid = edge.edgeUid.endsWith(':a')
        ? `${edge.connectionId}:b`
        : `${edge.connectionId}:a`
      if (frame.parentEdgeUid === mateUid) continue

      if (disc.has(edge.to)) {
        low.set(frame.node, Math.min(low.get(frame.node), disc.get(edge.to)))
        continue
      }

      timer += 1
      disc.set(edge.to, timer)
      low.set(edge.to, timer)
      stack.push({
        node: edge.to,
        parentEdgeUid: edge.edgeUid,
        parentConnectionId: edge.connectionId,
        nextIndex: 0,
      })
    }
  }

  return cycleIds
}

function countWeldGroups(cluster, connections) {
  const parent = new Map()
  const find = (key) => {
    const root = parent.get(key) ?? key
    if (root === key) {
      parent.set(key, key)
      return key
    }
    const resolved = find(root)
    parent.set(key, resolved)
    return resolved
  }

  for (const connection of connections) {
    if (!cluster.connectionIds.has(connection.id)) continue
    if (connection.a.kind !== 'shape' || connection.b.kind !== 'shape') continue
    const rootA = find(endpointVertexKey(connection.a))
    const rootB = find(endpointVertexKey(connection.b))
    if (rootA !== rootB) parent.set(rootB, rootA)
  }

  const roots = new Set()
  for (const key of parent.keys()) roots.add(find(key))
  return roots.size
}

function buildSimpleAdjacency(connections, cycleIds, within) {
  const adjacency = new Map()
  const touch = (id) => {
    if (!adjacency.has(id)) adjacency.set(id, new Set())
  }

  for (const connection of connections) {
    if (!cycleIds.has(connection.id)) continue
    if (connection.a.kind !== 'shape' || connection.b.kind !== 'shape') continue
    const a = connection.a.shapeId
    const b = connection.b.shapeId
    if (a === b) continue
    if (within && (!within.has(a) || !within.has(b))) continue
    touch(a)
    touch(b)
    adjacency.get(a).add(b)
    adjacency.get(b).add(a)
  }
  return adjacency
}

function findShortestSimpleCycleThroughEdge(adjacency, start, end) {
  if (!adjacency.get(start)?.has(end)) return null

  const queue = []
  const parent = new Map()

  for (const neighbor of adjacency.get(end) ?? []) {
    if (neighbor === start) continue
    queue.push(neighbor)
    parent.set(neighbor, end)
  }
  parent.set(end, null)

  let reached = null
  while (queue.length > 0) {
    const node = queue.shift()
    if (node === start) {
      reached = node
      break
    }
    for (const next of adjacency.get(node) ?? []) {
      if (parent.has(next)) continue
      if (node === end && next === start) continue
      parent.set(next, node)
      queue.push(next)
    }
  }

  if (reached !== start) return null

  const cycle = [start]
  let cursor = parent.get(start) ?? null
  while (cursor && cursor !== end) {
    cycle.push(cursor)
    cursor = parent.get(cursor) ?? null
  }
  if (cursor !== end) return null
  cycle.push(end)
  return cycle
}

function connectionsWithin(connections, cycleIds, shapeIds) {
  const ids = new Set()
  for (const connection of connections) {
    if (!cycleIds.has(connection.id)) continue
    if (connection.a.kind !== 'shape' || connection.b.kind !== 'shape') continue
    if (!shapeIds.has(connection.a.shapeId) || !shapeIds.has(connection.b.shapeId)) continue
    if (connection.a.shapeId === connection.b.shapeId) continue
    ids.add(connection.id)
  }
  return ids
}

function clusterFromShapeIds(shapeIds, connections, cycleIds) {
  const ids = new Set(shapeIds)
  return { shapeIds: ids, connectionIds: connectionsWithin(connections, cycleIds, ids) }
}

function panelCycleAllowed(members) {
  return members.every((shape) => FUSABLE_PANEL_KINDS.has(shape.kind))
}

function findFusableCluster(shapes, connections, newConnection, options = {}) {
  if (newConnection.a.kind !== 'shape' || newConnection.b.kind !== 'shape') return null
  if (newConnection.a.shapeId === newConnection.b.shapeId) return null

  const cycleIds = findCycleConnectionIds(connections)
  if (!cycleIds.has(newConnection.id)) return null

  const shapeA = newConnection.a.shapeId
  const shapeB = newConnection.b.shapeId
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))

  if (!shapesById.has(shapeA) || !shapesById.has(shapeB)) return null
  if (options.reelingIds?.has(shapeA) || options.reelingIds?.has(shapeB)) return null

  const pairIds = new Set([shapeA, shapeB])
  const pairCluster = clusterFromShapeIds(pairIds, connections, cycleIds)
  if (countWeldGroups(pairCluster, connections) >= MIN_LOOP_PINS) {
    return pairCluster
  }

  const adjacency = buildSimpleAdjacency(connections, cycleIds)
  const cycle = findShortestSimpleCycleThroughEdge(adjacency, shapeA, shapeB)
  if (!cycle || cycle.length < 3) return null

  for (const id of cycle) {
    if (!shapesById.has(id)) return null
    if (options.reelingIds?.has(id)) return null
  }

  const members = cycle.map((id) => shapesById.get(id))
  if (!panelCycleAllowed(members)) return null

  const cycleCluster = clusterFromShapeIds(cycle, connections, cycleIds)
  if (countWeldGroups(cycleCluster, connections) < MIN_LOOP_PINS) return null

  return cycleCluster
}

function straw(id) {
  return {
    id,
    kind: 'straw',
    size: 1,
    vertices: [
      [0, -0.5, 0],
      [0, 0.5, 0],
    ],
    edges: [[0, 1]],
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
  }
}

function triangle(id) {
  return {
    id,
    kind: 'triangle',
    size: 1,
    vertices: [
      [1, 0, 0],
      [-0.5, 0, 0.5],
      [-0.5, 0, -0.5],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 0],
    ],
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
  }
}

function square(id) {
  return {
    id,
    kind: 'square',
    size: 1,
    vertices: [
      [0.5, 0, 0.5],
      [0.5, 0, -0.5],
      [-0.5, 0, -0.5],
      [-0.5, 0, 0.5],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ],
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
  }
}

function link(id, aShape, aVertex, bShape, bVertex) {
  return {
    id,
    a: { kind: 'shape', shapeId: aShape, vertexIndex: aVertex },
    b: { kind: 'shape', shapeId: bShape, vertexIndex: bVertex },
  }
}

function assert(name, condition) {
  if (!condition) {
    console.error(`FAIL: ${name}`)
    process.exitCode = 1
    return
  }
  console.log(`ok  ${name}`)
}

// 1) Three straws tied into a triangle → fuse
{
  const shapes = [straw('s1'), straw('s2'), straw('s3')]
  const connections = [
    link('c1', 's1', 1, 's2', 0),
    link('c2', 's2', 1, 's3', 0),
    link('c3', 's3', 1, 's1', 0),
  ]
  const cluster = findFusableCluster(shapes, connections, connections[2])
  assert('3-straw triangle fuses', !!cluster && cluster.shapeIds.size === 3)
}

// 2) Hub tripod → no fuse
{
  const shapes = [straw('s1'), straw('s2'), straw('s3')]
  const connections = [
    link('c1', 's1', 0, 's2', 0),
    link('c2', 's2', 0, 's3', 0),
    link('c3', 's3', 0, 's1', 0),
  ]
  const cluster = findFusableCluster(shapes, connections, connections[2])
  assert('hub tripod stays floppy', cluster === null)
}

// 3) Triangle primitive + two straws closing a face → fuse
{
  const shapes = [triangle('t1'), straw('s1'), straw('s2')]
  const connections = [
    link('c1', 't1', 1, 's1', 0),
    link('c2', 's1', 1, 's2', 0),
    link('c3', 's2', 1, 't1', 2),
  ]
  const cluster = findFusableCluster(shapes, connections, connections[2])
  assert('triangle primitive + straws fuses', !!cluster && cluster.shapeIds.has('t1'))
}

// 4) Two triangles with 2 shared pins → hinge, no fuse
{
  const shapes = [triangle('t1'), triangle('t2')]
  const connections = [
    link('c1', 't1', 0, 't2', 0),
    link('c2', 't1', 1, 't2', 1),
  ]
  const cluster = findFusableCluster(shapes, connections, connections[1])
  assert('double-pin hinge stays floppy', cluster === null)
}

// 5) Two triangles with 3 shared pins → face weld fuses
{
  const shapes = [triangle('t1'), triangle('t2')]
  const connections = [
    link('c1', 't1', 0, 't2', 0),
    link('c2', 't1', 1, 't2', 1),
    link('c3', 't1', 2, 't2', 2),
  ]
  const cluster = findFusableCluster(shapes, connections, connections[2])
  assert('triple-pin face weld fuses', !!cluster && cluster.shapeIds.size === 2)
}

// 6) Three squares chained with 2+2 pins → hinge chain, no fuse
{
  const shapes = [square('q1'), square('q2'), square('q3')]
  const connections = [
    link('c1', 'q1', 2, 'q2', 0),
    link('c2', 'q1', 3, 'q2', 1),
    link('c3', 'q2', 2, 'q3', 0),
    link('c4', 'q2', 3, 'q3', 1),
  ]
  const cluster = findFusableCluster(shapes, connections, connections[3])
  assert('three-square hinge chain stays floppy', cluster === null)
}

// 7) Four-square ring → foldable, no fuse
{
  const shapes = [square('q0'), square('q1'), square('q2'), square('q3')]
  const connections = [
    link('a1', 'q0', 1, 'q1', 0),
    link('a2', 'q0', 2, 'q1', 3),
    link('b1', 'q1', 1, 'q2', 0),
    link('b2', 'q1', 2, 'q2', 3),
    link('c1', 'q2', 1, 'q3', 0),
    link('c2', 'q2', 2, 'q3', 3),
    link('d1', 'q3', 1, 'q0', 0),
    link('d2', 'q3', 2, 'q0', 3),
  ]
  const cluster = findFusableCluster(shapes, connections, connections[7])
  assert('four-square ring stays floppy', cluster === null)
}

// 8) Three-triangle trihedral corner → fuse
{
  const shapes = [triangle('t0'), triangle('t1'), triangle('t2')]
  const connections = [
    link('c1', 't0', 0, 't1', 0),
    link('c2', 't0', 1, 't1', 1),
    link('c3', 't1', 1, 't2', 0),
    link('c4', 't1', 2, 't2', 1),
    link('c5', 't2', 1, 't0', 1),
    link('c6', 't2', 2, 't0', 2),
  ]
  const cluster = findFusableCluster(shapes, connections, connections[5])
  assert(
    'three-triangle trihedral corner fuses',
    !!cluster && cluster.shapeIds.size === 3,
  )
}

// 9) Closed 4-triangle tetrahedron → fuse (at least a 3-face corner)
{
  const shapes = [
    triangle('ABC'),
    triangle('ABD'),
    triangle('ACD'),
    triangle('BCD'),
  ]
  const connections = [
    link('ab1', 'ABC', 0, 'ABD', 0),
    link('ab2', 'ABC', 1, 'ABD', 1),
    link('ac1', 'ABC', 0, 'ACD', 0),
    link('ac2', 'ABC', 2, 'ACD', 1),
    link('ad1', 'ABD', 0, 'ACD', 0),
    link('ad2', 'ABD', 2, 'ACD', 2),
    link('bc1', 'ABC', 1, 'BCD', 0),
    link('bc2', 'ABC', 2, 'BCD', 1),
    link('bd1', 'ABD', 1, 'BCD', 0),
    link('bd2', 'ABD', 2, 'BCD', 2),
    link('cd1', 'ACD', 1, 'BCD', 1),
    link('cd2', 'ACD', 2, 'BCD', 2),
  ]
  const cluster = findFusableCluster(shapes, connections, connections[11])
  assert(
    'closed 4-triangle tetrahedron fuses a corner',
    !!cluster && cluster.shapeIds.size >= 3 && cluster.shapeIds.size <= 4,
  )
}

// 10) Four-triangle strip path → no fuse
{
  const shapes = [triangle('t0'), triangle('t1'), triangle('t2'), triangle('t3')]
  const connections = [
    link('a1', 't0', 0, 't1', 0),
    link('a2', 't0', 1, 't1', 1),
    link('b1', 't1', 1, 't2', 0),
    link('b2', 't1', 2, 't2', 1),
    link('c1', 't2', 1, 't3', 0),
    link('c2', 't2', 2, 't3', 1),
  ]
  const cluster = findFusableCluster(shapes, connections, connections[5])
  assert('four-triangle strip stays floppy', cluster === null)
}

// 11) Hook-only hang → no fuse
{
  const shapes = [triangle('t1')]
  const connections = [
    {
      id: 'hook',
      a: { kind: 'anchor' },
      b: { kind: 'shape', shapeId: 't1', vertexIndex: 0 },
    },
  ]
  const cluster = findFusableCluster(shapes, connections, connections[0])
  assert('hook-only hang does not fuse', cluster === null)
}

// 12) Two-straw digon → no fuse
{
  const shapes = [straw('s1'), straw('s2')]
  const connections = [
    link('c1', 's1', 0, 's2', 0),
    link('c2', 's1', 1, 's2', 1),
  ]
  const cluster = findFusableCluster(shapes, connections, connections[1])
  assert('two-straw digon stays floppy', cluster === null)
}

if (process.exitCode) {
  console.error('\nverify-fusable-clusters: FAILED')
  process.exit(1)
}
console.log('\nverify-fusable-clusters: all checks passed')
