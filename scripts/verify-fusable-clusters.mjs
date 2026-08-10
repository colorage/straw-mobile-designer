/**
 * Quick checks for expanded fuse-cluster detection.
 * Run: node scripts/verify-fusable-clusters.mjs
 *
 * Mirrors src/physics/rigidClusters.ts so CI / local checks stay dependency-free.
 */

const MIN_LOOP_PINS = 3
const MIN_RIGID_PIN_WELDS = 2

function endpointBodyKey(endpoint) {
  return endpoint.kind === 'anchor' ? 'anchor' : endpoint.shapeId
}

function endpointVertexKey(endpoint) {
  return endpoint.kind === 'anchor' ? 'anchor' : `${endpoint.shapeId}:${endpoint.vertexIndex}`
}

function isRigidMember(shape) {
  return shape.kind !== 'straw'
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

function collectCycleComponent(connections, cycleIds, seedId) {
  const cycleConnections = connections.filter((connection) => cycleIds.has(connection.id))
  const adjacency = new Map()
  for (const connection of cycleConnections) {
    const a = endpointBodyKey(connection.a)
    const b = endpointBodyKey(connection.b)
    const listA = adjacency.get(a) ?? []
    listA.push({ to: b, connectionId: connection.id })
    adjacency.set(a, listA)
    const listB = adjacency.get(b) ?? []
    listB.push({ to: a, connectionId: connection.id })
    adjacency.set(b, listB)
  }

  const shapeIds = new Set([seedId])
  const connectionIds = new Set()
  const stack = [seedId]
  while (stack.length > 0) {
    const node = stack.pop()
    for (const { to, connectionId } of adjacency.get(node) ?? []) {
      connectionIds.add(connectionId)
      if (shapeIds.has(to)) continue
      shapeIds.add(to)
      stack.push(to)
    }
  }

  return { shapeIds, connectionIds }
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

function hasEnoughWeldPins(cluster, members, connections) {
  const weldGroups = countWeldGroups(cluster, connections)
  if (weldGroups >= MIN_LOOP_PINS) return true
  if (
    weldGroups >= MIN_RIGID_PIN_WELDS &&
    members.length >= 2 &&
    members.every(isRigidMember)
  ) {
    return true
  }
  return false
}

function findFusableCluster(shapes, connections, newConnection, options = {}) {
  if (newConnection.a.kind !== 'shape' || newConnection.b.kind !== 'shape') return null
  if (newConnection.a.shapeId === newConnection.b.shapeId) return null

  const cycleIds = findCycleConnectionIds(connections)
  if (!cycleIds.has(newConnection.id)) return null

  const cluster = collectCycleComponent(connections, cycleIds, newConnection.a.shapeId)
  if (cluster.shapeIds.size < 2) return null

  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  const members = []
  for (const id of cluster.shapeIds) {
    const shape = shapesById.get(id)
    if (!shape) return null
    if (options.reelingIds?.has(id)) return null
    members.push(shape)
  }

  if (!hasEnoughWeldPins(cluster, members, connections)) return null
  return cluster
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

// 2) Hub tripod (three straws on one shared corner) → no fuse
{
  const shapes = [straw('s1'), straw('s2'), straw('s3')]
  // Pairwise ties that all collapse onto one weld group: each straw's vertex 0
  // tied to the next straw's vertex 0 — a graph cycle, but one pin.
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
  // Primitive corners 0-1 already rigid; straws close 1→2 and 2→0.
  const connections = [
    link('c1', 't1', 1, 's1', 0),
    link('c2', 's1', 1, 's2', 0),
    link('c3', 's2', 1, 't1', 2),
    // Second path around the primitive edge via another straw pair would also
    // work; here the cycle is t1–s1–s2–t1. Need one more tie from t1:0?
    // Actually t1 is only linked at vertices 1 and 2. Cycle: t1-s1-s2-t1 uses
    // two attachments on t1 — that's a cycle through three bodies.
  ]
  const cluster = findFusableCluster(shapes, connections, connections[2])
  assert('triangle primitive + straws fuses', !!cluster && cluster.shapeIds.has('t1'))
}

// 4) Two triangles with 2 shared pins → fuse
{
  const shapes = [triangle('t1'), triangle('t2')]
  const connections = [
    link('c1', 't1', 0, 't2', 0),
    link('c2', 't1', 1, 't2', 1),
  ]
  const cluster = findFusableCluster(shapes, connections, connections[1])
  assert('double-pin rigid weld fuses', !!cluster && cluster.shapeIds.size === 2)
}

// 5) Shape tied only to the hook → no fuse (hang rope untouched)
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

// 6) Two straws double-tied (degenerate digon) → no fuse (not all rigid)
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
