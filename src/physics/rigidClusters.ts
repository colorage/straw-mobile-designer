import {
  endpointBodyKey,
  endpointVertexKey,
  type Connection,
  type Shape,
} from '../state/types'

/**
 * A closed loop of hand-tied straws that should behave as one rigid piece.
 *
 * Ball-and-socket threads are deliberately floppy, so an N-straw ring is N
 * bodies and N soft joints where the equivalent toolbar primitive is a single
 * body with N hull colliders. Fusing the ring into one shape is what makes a
 * hand-built pyramid as stable as the toolbar one.
 */
export interface FusableCluster {
  /** Shapes to merge into the fused piece. */
  shapeIds: Set<string>
  /** Threads wholly inside the cluster — they become welded corners. */
  connectionIds: Set<string>
}

/** Kinds that may be swallowed into a fused piece; primitives stay cuttable. */
const FUSABLE_KINDS = new Set(['straw', 'assembly'])

/** A rigid loop has to weld at least this many distinct corners (see below). */
const MIN_DISTINCT_PINS = 3

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

/** Shapes joined to `seedId` through cycle threads only. */
function collectCycleComponent(
  connections: Connection[],
  cycleIds: ReadonlySet<string>,
  seedId: string,
): FusableCluster {
  const cycleConnections = connections.filter((connection) => cycleIds.has(connection.id))
  const adjacency = new Map<string, { to: string; connectionId: string }[]>()
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

  const shapeIds = new Set<string>([seedId])
  const connectionIds = new Set<string>()
  const stack = [seedId]
  while (stack.length > 0) {
    const node = stack.pop()!
    for (const { to, connectionId } of adjacency.get(node) ?? []) {
      connectionIds.add(connectionId)
      if (shapeIds.has(to)) continue
      shapeIds.add(to)
      stack.push(to)
    }
  }

  return { shapeIds, connectionIds }
}

/**
 * Count the distinct corners the cluster's threads weld together — connected
 * components over tied endpoints, NOT spatial positions.
 *
 * Three straws tied pairwise at one shared corner form a graph cycle but a
 * floppy tripod: all its ties collapse into a single weld group, so there is
 * nothing rigid to freeze. Real loops (triangle, square, pyramid face) weld
 * three or more separate corners. Counting topologically matters because a
 * legitimate loop can fold flat while it is tied — a 4-straw cycle collapsed
 * into a needle still has 4 weld groups even though its corner PAIRS overlap
 * in space, and it deserves to fuse (and snap square) rather than stay floppy.
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

export interface FusableClusterOptions {
  /** Shapes mid reel-in; fusing waits until their poses land. */
  reelingIds?: ReadonlySet<string>
}

/**
 * The closed loop `newConnection` just completed, or null when the tie only
 * added a floppy branch.
 *
 * Rejects clusters that cannot be fused cleanly: members that are toolbar
 * primitives (kept separately cuttable), pieces still animating, and hub-only
 * cycles that weld fewer than three distinct corners (not actually rigid).
 * Mixed straw sizes are fine — the fused shape tracks a size per straw.
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

  const cluster = collectCycleComponent(connections, cycleIds, newConnection.a.shapeId)
  if (cluster.shapeIds.size < 2) return null

  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]))
  for (const id of cluster.shapeIds) {
    const shape = shapesById.get(id)
    if (!shape) return null
    if (!FUSABLE_KINDS.has(shape.kind)) return null
    if (options.reelingIds?.has(id)) return null
  }

  if (countWeldGroups(cluster, connections) < MIN_DISTINCT_PINS) return null

  return cluster
}
