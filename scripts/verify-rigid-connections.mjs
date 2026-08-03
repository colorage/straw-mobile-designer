/**
 * Quick checks for hybrid joint-role classification.
 * Run: node scripts/verify-rigid-connections.mjs
 */

function endpointBodyKey(endpoint) {
  return endpoint.kind === 'anchor' ? 'anchor' : endpoint.shapeId
}

function getConnectionJointRoles(connections) {
  const roles = new Map()
  for (const connection of connections) {
    if (connection.a.kind === 'anchor' || connection.b.kind === 'anchor') {
      roles.set(connection.id, 'spherical')
    }
  }

  const adjacency = new Map()
  const shapeConnections = []
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
    shapeConnections.push(connection)
    addEdge(a, b, connection.id, `${connection.id}:a`)
    addEdge(b, a, connection.id, `${connection.id}:b`)
  }

  const disc = new Map()
  const low = new Map()
  const bridgeIds = new Set()
  let timer = 0
  const dfs = (u, parentEdgeUid) => {
    timer += 1
    disc.set(u, timer)
    low.set(u, timer)
    for (const { to: v, connectionId, edgeUid } of adjacency.get(u) ?? []) {
      if (edgeUid === parentEdgeUid) continue
      const mateUid = edgeUid.endsWith(':a') ? `${connectionId}:b` : `${connectionId}:a`
      if (parentEdgeUid === mateUid) continue
      if (!disc.has(v)) {
        dfs(v, edgeUid)
        low.set(u, Math.min(low.get(u), low.get(v)))
        if (low.get(v) > disc.get(u)) bridgeIds.add(connectionId)
      } else low.set(u, Math.min(low.get(u), disc.get(v)))
    }
  }
  for (const node of adjacency.keys()) if (!disc.has(node)) dfs(node, null)

  const cycleEdges = []
  for (const connection of shapeConnections) {
    if (bridgeIds.has(connection.id)) roles.set(connection.id, 'spherical')
    else cycleEdges.push(connection)
  }

  const cycleAdj = new Map()
  for (const connection of cycleEdges) {
    const a = endpointBodyKey(connection.a)
    const b = endpointBodyKey(connection.b)
    const listA = cycleAdj.get(a) ?? []
    listA.push({ to: b, connectionId: connection.id })
    cycleAdj.set(a, listA)
    const listB = cycleAdj.get(b) ?? []
    listB.push({ to: a, connectionId: connection.id })
    cycleAdj.set(b, listB)
  }

  const visited = new Set()
  for (const start of cycleAdj.keys()) {
    if (visited.has(start)) continue
    const componentNodes = []
    const componentEdgeIds = []
    const seenEdges = new Set()
    const stack = [start]
    visited.add(start)
    while (stack.length) {
      const u = stack.pop()
      componentNodes.push(u)
      for (const { to, connectionId } of cycleAdj.get(u) ?? []) {
        if (!seenEdges.has(connectionId)) {
          seenEdges.add(connectionId)
          componentEdgeIds.push(connectionId)
        }
        if (!visited.has(to)) {
          visited.add(to)
          stack.push(to)
        }
      }
    }
    const treeIds = new Set()
    const treeVisited = new Set()
    const queue = [componentNodes[0]]
    treeVisited.add(componentNodes[0])
    while (queue.length) {
      const u = queue.shift()
      for (const { to, connectionId } of cycleAdj.get(u) ?? []) {
        if (treeVisited.has(to)) continue
        treeVisited.add(to)
        treeIds.add(connectionId)
        queue.push(to)
      }
    }
    for (const connectionId of componentEdgeIds) {
      roles.set(connectionId, treeIds.has(connectionId) ? 'fixed' : 'visual')
    }
  }
  return roles
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

{
  const roles = getConnectionJointRoles([
    {
      id: 'c1',
      a: { kind: 'shape', shapeId: 'a', vertexIndex: 0 },
      b: { kind: 'shape', shapeId: 'b', vertexIndex: 0 },
    },
    {
      id: 'c2',
      a: { kind: 'shape', shapeId: 'b', vertexIndex: 1 },
      b: { kind: 'shape', shapeId: 'c', vertexIndex: 0 },
    },
  ])
  assert(roles.get('c1') === 'spherical' && roles.get('c2') === 'spherical', 'chain floppy')
  console.log('ok: open chain spherical')
}

{
  const roles = getConnectionJointRoles([
    {
      id: 'c1',
      a: { kind: 'shape', shapeId: 'a', vertexIndex: 0 },
      b: { kind: 'shape', shapeId: 'b', vertexIndex: 0 },
    },
    {
      id: 'c2',
      a: { kind: 'shape', shapeId: 'b', vertexIndex: 1 },
      b: { kind: 'shape', shapeId: 'c', vertexIndex: 0 },
    },
    {
      id: 'c3',
      a: { kind: 'shape', shapeId: 'c', vertexIndex: 1 },
      b: { kind: 'shape', shapeId: 'a', vertexIndex: 1 },
    },
  ])
  const fixed = [...roles].filter(([, r]) => r === 'fixed').map(([id]) => id)
  const visual = [...roles].filter(([, r]) => r === 'visual').map(([id]) => id)
  assert(fixed.length === 2, `triangle needs 2 fixed (tree), got ${fixed}`)
  assert(visual.length === 1, `triangle needs 1 visual, got ${visual}`)
  console.log('ok: triangle 2 fixed + 1 visual')
}

{
  const roles = getConnectionJointRoles([
    {
      id: 'c1',
      a: { kind: 'shape', shapeId: 'a', vertexIndex: 0 },
      b: { kind: 'shape', shapeId: 'b', vertexIndex: 0 },
    },
    {
      id: 'c2',
      a: { kind: 'shape', shapeId: 'b', vertexIndex: 1 },
      b: { kind: 'shape', shapeId: 'c', vertexIndex: 0 },
    },
    {
      id: 'c3',
      a: { kind: 'shape', shapeId: 'c', vertexIndex: 1 },
      b: { kind: 'shape', shapeId: 'a', vertexIndex: 1 },
    },
    {
      id: 'spoke',
      a: { kind: 'shape', shapeId: 'a', vertexIndex: 0 },
      b: { kind: 'shape', shapeId: 'd', vertexIndex: 0 },
    },
    {
      id: 'hook',
      a: { kind: 'anchor' },
      b: { kind: 'shape', shapeId: 'a', vertexIndex: 0 },
    },
  ])
  assert(roles.get('spoke') === 'spherical', 'spoke spherical')
  assert(roles.get('hook') === 'spherical', 'hook spherical')
  const fixed = [...roles].filter(([, r]) => r === 'fixed')
  assert(fixed.length === 2, `expected 2 fixed, got ${fixed.length}`)
  console.log('ok: triangle + spoke + hook')
}

console.log('all rigid-connection checks passed')
