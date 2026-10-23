import type { ElkExtendedEdge, ElkNode } from '@openedges/elk-layout';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import type { Direction } from '@mytypes/graphTypes';

import { resolveElkAlgorithm, type ElkAlgo } from './elkUtils';

export type Positions = Map<string, { x: number; y: number }>;
export type NodeLayoutSize = { width: number; height: number };
export type NodeLayoutSizeResolver = (node: RFNode) => NodeLayoutSize;
export type LayoutSpacing = {
  nodeSep: number;
  rankSep: number;
  edgeSep: number;
  edgeNodeSep: number;
  padding: number;
};

type FallbackLayoutParams = Pick<
  LayoutSpacing,
  'nodeSep' | 'rankSep' | 'padding'
> & {
  direction: Direction;
};

const DEFAULT_NODE_SIZE = 64;

export function getGraphTopologyKey(rfNodes: RFNode[], rfEdges: RFEdge[]): string {
  const nIds = rfNodes
    .map((n) => String(n.id))
    .sort((a, b) => a.localeCompare(b))
    .join('|');
  const ePairs = Array.from(
    new Set(
      rfEdges
        .filter((e) => String(e.source) !== String(e.target))
        .map((e) => `${e.source}→${e.target}`)
    )
  )
    .sort()
    .join('|');
  return `${nIds}__${ePairs}`;
}

/** Snapshot values so in-place edits remain visible without sorting unchanged graphs. */
export function captureGraphTopologySnapshot(
  nodes: RFNode[],
  edges: RFEdge[]
): {
  key: string;
  matches: (currentNodes: RFNode[], currentEdges: RFEdge[]) => boolean;
} {
  const nodeIds = nodes.map((node) => String(node.id));
  const sources = edges.map((edge) => String(edge.source));
  const targets = edges.map((edge) => String(edge.target));
  const key = getGraphTopologyKey(nodes, edges);

  function matchesInOrder(currentNodes: RFNode[], currentEdges: RFEdge[]) {
    if (
      currentNodes.length !== nodeIds.length ||
      currentEdges.length !== sources.length
    ) {
      return false;
    }
    for (let i = 0; i < nodeIds.length; i++) {
      if (String(currentNodes[i].id) !== nodeIds[i]) return false;
    }
    for (let i = 0; i < sources.length; i++) {
      if (
        String(currentEdges[i].source) !== sources[i] ||
        String(currentEdges[i].target) !== targets[i]
      ) {
        return false;
      }
    }
    return true;
  }

  return {
    key,
    matches: (currentNodes, currentEdges) =>
      matchesInOrder(currentNodes, currentEdges) ||
      // Reordering, duplicate edges and self-loops can differ in the snapshot
      // while representing exactly the same topology under the existing key.
      getGraphTopologyKey(currentNodes, currentEdges) === key,
  };
}

export function getDefaultNodeLayoutSize(node: RFNode): NodeLayoutSize {
  const width = node.measured?.width ?? node.width ?? DEFAULT_NODE_SIZE;
  const height = node.measured?.height ?? node.height ?? DEFAULT_NODE_SIZE;
  return { width, height };
}

function buildFallbackPositions(
  rfNodes: RFNode[],
  rfEdges: RFEdge[],
  { nodeSep, rankSep, padding, direction }: FallbackLayoutParams,
  getNodeLayoutSize: NodeLayoutSizeResolver
): Map<string, { x: number; y: number }> {
  const nodeIds = rfNodes.map((n) => String(n.id));
  const nodeSet = new Set(nodeIds);
  const out = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const id of nodeIds) {
    out.set(id, []);
    indegree.set(id, 0);
  }

  for (const e of rfEdges) {
    const source = String(e.source);
    const target = String(e.target);
    if (source === target) continue;
    if (!nodeSet.has(source) || !nodeSet.has(target)) continue;
    out.get(source)!.push(target);
    indegree.set(target, (indegree.get(target) ?? 0) + 1);
  }

  const roots = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  if (!roots.length && nodeIds.length) roots.push(nodeIds[0]!);

  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const id of roots) {
    depth.set(id, 0);
    queue.push(id);
  }

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    const d = depth.get(id) ?? 0;
    for (const child of out.get(id) ?? []) {
      const nextDepth = d + 1;
      const prev = depth.get(child);
      if (prev == null || nextDepth < prev) {
        depth.set(child, nextDepth);
        queue.push(child);
      }
    }
  }

  let maxDepth = 0;
  for (const d of depth.values()) maxDepth = Math.max(maxDepth, d);

  for (const id of nodeIds) {
    if (depth.has(id)) continue;
    maxDepth += 1;
    depth.set(id, maxDepth);
  }

  const layers = new Map<number, string[]>();
  for (const id of nodeIds) {
    const d = depth.get(id) ?? 0;
    const layer = layers.get(d);
    if (layer) layer.push(id);
    else layers.set(d, [id]);
  }

  let maxWidth = DEFAULT_NODE_SIZE;
  let maxHeight = DEFAULT_NODE_SIZE;
  for (const node of rfNodes) {
    const size = getNodeLayoutSize(node);
    maxWidth = Math.max(maxWidth, size.width);
    maxHeight = Math.max(maxHeight, size.height);
  }
  const levelSpacing =
    (direction === 'RIGHT' || direction === 'LEFT' ? maxWidth : maxHeight) + rankSep;
  const siblingSpacing =
    (direction === 'RIGHT' || direction === 'LEFT' ? maxHeight : maxWidth) + nodeSep;

  const positions = new Map<string, { x: number; y: number }>();
  for (const [rawDepth, ids] of layers) {
    const depthIndex =
      direction === 'LEFT' || direction === 'UP' ? maxDepth - rawDepth : rawDepth;
    const orderedIds = [...ids].sort((a, b) => a.localeCompare(b));
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i]!;
      let x = padding;
      let y = padding;
      if (direction === 'RIGHT' || direction === 'LEFT') {
        x += depthIndex * levelSpacing;
        y += i * siblingSpacing;
      } else {
        x += i * siblingSpacing;
        y += depthIndex * levelSpacing;
      }
      positions.set(id, { x, y });
    }
  }

  return positions;
}

/** Keep ELK input construction independent from asynchronous scheduling. */
export function buildElkGraph(
  nodes: RFNode[],
  edges: RFEdge[],
  getNodeLayoutSize: NodeLayoutSizeResolver,
  {
    algorithm,
    direction,
    nodeSep,
    rankSep,
    edgeSep,
    edgeNodeSep,
    padding,
  }: LayoutSpacing & { algorithm: ElkAlgo; direction: Direction }
): ElkNode {
  const children = nodes.map((node) => ({
    ...getNodeLayoutSize(node),
    id: node.id,
  }));
  const nodeIds = new Set(children.map((node) => node.id));
  const seenEdgeIds = new Set<string>();
  const elkEdges: ElkExtendedEdge[] = [];

  for (const edge of edges) {
    const source = String(edge.source);
    const target = String(edge.target);
    if (source === target || !nodeIds.has(source) || !nodeIds.has(target)) continue;
    const id = String(edge.id || `${source}→${target}`);
    if (seenEdgeIds.has(id)) continue;
    seenEdgeIds.add(id);
    elkEdges.push({ id, sources: [source], targets: [target] });
  }

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': resolveElkAlgorithm(algorithm),
      'elk.spacing.nodeNode': String(nodeSep),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(rankSep),
      'elk.spacing.edgeEdge': String(edgeSep),
      'elk.spacing.edgeNode': String(edgeNodeSep),
      'elk.padding': String(padding),
      'elk.direction': direction,
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    },
    children,
    edges: elkEdges,
  };
}

export function readElkPositions(graph: ElkNode): Positions {
  const positions: Positions = new Map();
  for (const node of graph.children ?? []) {
    if (node.id) positions.set(node.id, { x: node.x ?? 0, y: node.y ?? 0 });
  }
  return positions;
}

export function buildRecoveryLayout(
  nodes: RFNode[],
  edges: RFEdge[],
  spacing: FallbackLayoutParams,
  getNodeLayoutSize: NodeLayoutSizeResolver
): Positions {
  try {
    return buildFallbackPositions(nodes, edges, spacing, getNodeLayoutSize);
  } catch {
    // Last-resort placement if node dimensions cannot be resolved.
    const spacingX = DEFAULT_NODE_SIZE + Math.max(24, spacing.nodeSep);
    const spacingY = DEFAULT_NODE_SIZE + Math.max(24, spacing.rankSep);
    return new Map(
      nodes.map((node, index) => [
        String(node.id),
        {
          x: spacing.padding + (index % 20) * spacingX,
          y: spacing.padding + Math.floor(index / 20) * spacingY,
        },
      ])
    );
  }
}
