import { endpointBodyKey, type Connection } from '../state/types'

type GraphEdge = {
  to: string
  connectionId: string
  edgeUid: string
}

export type JointRole = 'fixed' | 'spherical' | 'visual'

/**
 * Classify each connection for hybrid rigs:
 * - `fixed`: spanning-tree edge inside a cyclic cluster (strong weld)
 * - `spherical`: bridge / hook link (floppy swing)
 * - `visual`: redundant cycle edge beyond the spanning tree (thread draws, but
 *   no physics joint — a third weld on a triangle overconstrains impulse joints)
 */
export function getConnectionJointRoles(connections: Connection[]): Map<string, JointRole> {
  const roles = new Map<string, JointRole>()
  for (const connection of connections) {
    // Hook links always swing.
    if (connection.a.kind === 'anchor' || connection.b.kind === 'anchor') {
      roles.set(connection.id, 'spherical')
    }
  }

  const adjacency = new Map<string, GraphEdge[]>()
  const shapeConnections: Connection[] = []

  const addEdge = (from: string, to: string, connectionId: string, edgeUid: string) => {
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

  if (shapeConnections.length === 0) return roles

  const disc = new Map<string, number>()
  const low = new Map<string, number>()
  const bridgeIds = new Set<string>()
  let timer = 0

  const dfs = (u: string, parentEdgeUid: string | null) => {
    timer += 1
    disc.set(u, timer)
    low.set(u, timer)

    for (const { to: v, connectionId, edgeUid } of adjacency.get(u) ?? []) {
      if (edgeUid === parentEdgeUid) continue
      const mateUid = edgeUid.endsWith(':a') ? `${connectionId}:b` : `${connectionId}:a`
      if (parentEdgeUid === mateUid) continue

      if (!disc.has(v)) {
        dfs(v, edgeUid)
        low.set(u, Math.min(low.get(u)!, low.get(v)!))
        if (low.get(v)! > disc.get(u)!) {
          bridgeIds.add(connectionId)
        }
      } else {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!))
      }
    }
  }

  for (const node of adjacency.keys()) {
    if (!disc.has(node)) dfs(node, null)
  }

  // Non-bridge edges participate in cycles → rigid-cluster candidates.
  const cycleEdges: Connection[] = []
  for (const connection of shapeConnections) {
    if (bridgeIds.has(connection.id)) {
      roles.set(connection.id, 'spherical')
    } else {
      cycleEdges.push(connection)
    }
  }

  // Connected components over cycle edges; spanning tree → fixed, rest → visual.
  const cycleAdj = new Map<string, { to: string; connectionId: string }[]>()
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

  const visited = new Set<string>()
  for (const start of cycleAdj.keys()) {
    if (visited.has(start)) continue

    // Collect component nodes + edges (unique connection ids).
    const componentNodes: string[] = []
    const componentEdgeIds: string[] = []
    const seenEdges = new Set<string>()
    const stack = [start]
    visited.add(start)
    while (stack.length > 0) {
      const u = stack.pop()!
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

    // BFS spanning tree within the component.
    const treeIds = new Set<string>()
    const treeVisited = new Set<string>()
    const queue = [componentNodes[0]!]
    treeVisited.add(componentNodes[0]!)
    while (queue.length > 0) {
      const u = queue.shift()!
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

/** Connection ids that should use a fixed/weld joint (spanning tree of rigid clusters). */
export function getRigidConnectionIds(connections: Connection[]): Set<string> {
  const roles = getConnectionJointRoles(connections)
  const rigid = new Set<string>()
  for (const [id, role] of roles) {
    if (role === 'fixed') rigid.add(id)
  }
  return rigid
}

/**
 * True when the cream thread line should render for this joint role.
 * Cycle edges inside a rigid cluster (fixed + visual) are straw-to-straw joins —
 * the closed shape itself is the structure, so no hanging-thread line.
 * Only floppy / hook links keep a visible thread.
 */
export function jointRoleShowsThread(role: JointRole | undefined): boolean {
  return role === 'spherical' || role === undefined
}
