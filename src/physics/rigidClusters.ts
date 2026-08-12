import {
  endpointBodyKey,
  endpointVertexKey,
  type Connection,
  type Shape,
} from '../state/types'

/**
 * A closed loop of tied shapes that should behave as one rigid piece.
 *
 * Ball-and-socket threads are deliberately floppy, so an N-body ring is N
 * bodies and N soft joints where the equivalent toolbar primitive is a single
 * body with N hull colliders. Fusing the ring into one shape is what makes a
 * hand-built pyramid as stable as the toolbar one — and what keeps multi-piece
 * rigid constructions cheap under gravity.
 *
 * We fuse the *smallest* rigid subcluster that contains the new tie (a
 * 3-triangle corner, a straw face, or a 3-pin face lock), then multipass can
 * swallow the rest of a tetrahedron. Two-corner square chains and square rings
 * stay hinged.
 */
export interface FusableCluster {
  /** Shapes to merge into the fused piece. */
  shapeIds: Set<string>
  /** Threads wholly inside the cluster — they become welded corners. */
  connectionIds: Set<string>
}

/** A rigid loop has to weld at least this many distinct corners (see below). */
const MIN_LOOP_PINS = 3

/** Panel kinds that may form a rigid face cycle (triangles / straws / prior fuses). */
const FUSABLE_PANEL_KINDS = new Set(['straw', 'triangle', 'assembly'])

type GraphEdge = {
  to: string
  connectionId: string
  /** Distinguishes the two directed halves of one connection. */
  edgeUid: string
}

/**
 * Connection ids that are *not* bridges, i.e. that take part in a cycle.
 *
 * Tarjan low-link over the shape-only graph. Anchor links are excluded so a
 * piece tied to the hook at two corners still swings from the hook, and
 * self-links (both ends on one shape) carry no information about rigidity.
 *
 * Parallel threads between two shapes count as a graph cycle (a digon). That
 * alone is not enough to fuse — see pin checks and simple-cycle search.
 */
function findCycleConnectionIds(connections: Connection[]): Set<string> {
  const adjacency = new Map<string, GraphEdge[]>()
  const shapeConnectionIds: string[] = []

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
    shapeConnectionIds.push(connection.id)
    addEdge(a, b, connection.id, `${connection.id}:a`)
    addEdge(b, a, connection.id, `${connection.id}:b`)
  }

  const cycleIds = new Set(shapeConnectionIds)
  if (cycleIds.size === 0) return cycleIds

  const disc = new Map<string, number>()
  const low = new Map<string, number>()
  let timer = 0

  // Iterative DFS — a deep chain of straws would blow a recursive stack.
  for (const root of adjacency.keys()) {
    if (disc.has(root)) continue

    const stack: {
      node: string
      parentEdgeUid: string | null
      parentConnectionId: string | null
      nextIndex: number
    }[] = [{ node: root, parentEdgeUid: null, parentConnectionId: null, nextIndex: 0 }]
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
          low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!))
          // A child that cannot reach past its parent hangs off a bridge.
          if (frame.parentConnectionId && low.get(frame.node)! > disc.get(parent.node)!) {
            cycleIds.delete(frame.parentConnectionId)
          }
        }
        continue
      }

      const edge = edges[frame.nextIndex]
      frame.nextIndex += 1

      // Skip only the exact edge we arrived on; a parallel thread between the
      // same two shapes is a real cycle.
      const mateUid = edge.edgeUid.endsWith(':a')
        ? `${edge.connectionId}:b`
        : `${edge.connectionId}:a`
      if (frame.parentEdgeUid === mateUid) continue

      if (disc.has(edge.to)) {
        low.set(frame.node, Math.min(low.get(frame.node)!, disc.get(edge.to)!))
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

/**
 * Count the distinct corners the cluster's threads weld together — connected
 * components over tied endpoints, NOT spatial positions.
 *
 * Three straws tied pairwise at one shared corner form a graph cycle but a
 * floppy tripod: all its ties collapse into a single weld group, so there is
 * nothing rigid to freeze. Real loops (triangle, square, pyramid face) weld
 * three or more separate corners. Two pins alone are only a hinge.
 */
function countWeldGroups(cluster: FusableCluster, connections: Connection[]): number {
  const parent = new Map<string, string>()
  const find = (key: string): string => {
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

  const roots = new Set<string>()
  for (const key of parent.keys()) roots.add(find(key))
  return roots.size
}

/** Undirected simple adjacency (one edge per shape-pair) over cycle ties. */
function buildSimpleAdjacency(
  connections: Connection[],
  cycleIds: ReadonlySet<string>,
  within?: ReadonlySet<string>,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>()
  const touch = (id: string) => {
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
    adjacency.get(a)!.add(b)
    adjacency.get(b)!.add(a)
  }
  return adjacency
}

/**
 * Shortest simple cycle (length ≥3) through the undirected edge `start–end`,
 * or null when that edge only sits on digons / trees.
 */
function findShortestSimpleCycleThroughEdge(
  adjacency: Map<string, Set<string>>,
  start: string,
  end: string,
): string[] | null {
  if (!adjacency.get(start)?.has(end)) return null

  // BFS from `end`, forbidding the direct edge back to `start` on the first
  // step, until we reach `start` again — that path + the direct edge is the
  // shortest simple cycle through (start, end).
  const queue: string[] = []
  const parent = new Map<string, string | null>()

  for (const neighbor of adjacency.get(end) ?? []) {
    if (neighbor === start) continue
    queue.push(neighbor)
    parent.set(neighbor, end)
  }
  parent.set(end, null)

  let reached: string | null = null
  while (queue.length > 0) {
    const node = queue.shift()!
    if (node === start) {
      reached = node
      break
    }
    for (const next of adjacency.get(node) ?? []) {
      if (parent.has(next)) continue
      // Do not use the chord (start–end) as a bypass while searching.
      if (node === end && next === start) continue
      parent.set(next, node)
      queue.push(next)
    }
  }

  if (reached !== start) return null

  const cycle: string[] = [start]
  let cursor: string | null = parent.get(start) ?? null
  while (cursor && cursor !== end) {
    cycle.push(cursor)
    cursor = parent.get(cursor) ?? null
  }
  if (cursor !== end) return null
  cycle.push(end)
  return cycle
}

/** Connections whose both ends lie in `shapeIds` and participate in cycles. */
function connectionsWithin(
  connections: Connection[],
  cycleIds: ReadonlySet<string>,
  shapeIds: ReadonlySet<string>,
): Set<string> {
  const ids = new Set<string>()
  for (const connection of connections) {
    if (!cycleIds.has(connection.id)) continue
    if (connection.a.kind !== 'shape' || connection.b.kind !== 'shape') continue
    if (!shapeIds.has(connection.a.shapeId) || !shapeIds.has(connection.b.shapeId)) continue
    if (connection.a.shapeId === connection.b.shapeId) continue
    ids.add(connection.id)
  }
  return ids
}

function clusterFromShapeIds(
  shapeIds: Iterable<string>,
  connections: Connection[],
  cycleIds: ReadonlySet<string>,
): FusableCluster {
  const ids = new Set(shapeIds)
  return {
    shapeIds: ids,
    connectionIds: connectionsWithin(connections, cycleIds, ids),
  }
}

/** Square / octahedron panels make foldable rings — never fuse those cycles. */
function panelCycleAllowed(members: Shape[]): boolean {
  return members.every((shape) => FUSABLE_PANEL_KINDS.has(shape.kind))
}

export interface FusableClusterOptions {
  /** Shapes mid reel-in; fusing waits until their poses land. */
  reelingIds?: ReadonlySet<string>
}

/**
 * The smallest rigid cluster `newConnection` just completed, or null when the
 * tie only added a floppy hinge / branch.
 *
 * Prefers a 3-pin lock between two bodies, otherwise the shortest simple cycle
 * through the new shape-pair when every panel is a straw, triangle, or prior
 * assembly (tetrahedron corners). Square hinge chains and square rings stay
 * floppy. Anchor / single-thread hang links stay outside so mobiles swing.
 */
export function findFusableCluster(
  shapes: Shape[],
  connections: Connection[],
  newConnection: Connection,
  options: FusableClusterOptions = {},
): FusableCluster | null {
  if (newConnection.a.kind !== 'shape' || newConnection.b.kind !== 'shape') return null
  if (newConnection.a.shapeId === newConnection.b.shapeId) return null

  const cycleIds = findCycleConnectionIds(connections)
  if (!cycleIds.has(newConnection.id)) return null

  const shapeA = newConnection.a.shapeId
  const shapeB = newConnection.b.shapeId
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))

  if (!shapesById.has(shapeA) || !shapesById.has(shapeB)) return null
  if (options.reelingIds?.has(shapeA) || options.reelingIds?.has(shapeB)) return null

  // --- Two-body face lock (≥3 distinct pins between the pair) ---
  // Any kinds: three shared corners freeze relative motion (shared face).
  const pairIds = new Set([shapeA, shapeB])
  const pairCluster = clusterFromShapeIds(pairIds, connections, cycleIds)
  if (countWeldGroups(pairCluster, connections) >= MIN_LOOP_PINS) {
    return pairCluster
  }

  // --- Shortest simple cycle through this shape-pair ---
  const adjacency = buildSimpleAdjacency(connections, cycleIds)
  const cycle = findShortestSimpleCycleThroughEdge(adjacency, shapeA, shapeB)
  if (!cycle || cycle.length < 3) return null

  for (const id of cycle) {
    if (!shapesById.has(id)) return null
    if (options.reelingIds?.has(id)) return null
  }

  const members = cycle.map((id) => shapesById.get(id)!)
  if (!panelCycleAllowed(members)) return null

  const cycleCluster = clusterFromShapeIds(cycle, connections, cycleIds)
  if (countWeldGroups(cycleCluster, connections) < MIN_LOOP_PINS) return null

  return cycleCluster
}
