import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import type { Direction } from '@mytypes/graphTypes';

type Axis = 'horizontal' | 'vertical';

type ResolveAutoDirectionParams = {
  nodes: RFNode[];
  edges: RFEdge[];
  containerWidth: number;
  containerHeight: number;
  preferredDirection: Direction;
  previousDirection?: Direction;
  hysteresis?: number;
};

const MIN_VALUE = 1e-6;
const DEFAULT_HYSTERESIS = 0.08;

function axisFromDirection(direction: Direction): Axis {
  return direction === 'LEFT' || direction === 'RIGHT' ? 'horizontal' : 'vertical';
}

function directionForAxis(axis: Axis, preferredDirection: Direction): Direction {
  if (axis === 'horizontal') return preferredDirection === 'LEFT' ? 'LEFT' : 'RIGHT';
  return preferredDirection === 'UP' ? 'UP' : 'DOWN';
}

function estimateGraphShape(nodes: RFNode[], edges: RFEdge[]): { depth: number; breadth: number } {
  if (!nodes.length) return { depth: 1, breadth: 1 };

  const nodeIds = nodes.map((n) => String(n.id));
  const nodeSet = new Set(nodeIds);
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const id of nodeIds) {
    outgoing.set(id, []);
    indegree.set(id, 0);
  }

  for (const edge of edges) {
    const source = String(edge.source);
    const target = String(edge.target);
    if (source === target) continue;
    if (!nodeSet.has(source) || !nodeSet.has(target)) continue;
    outgoing.get(source)!.push(target);
    indegree.set(target, (indegree.get(target) ?? 0) + 1);
  }

  const roots = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  if (!roots.length && nodeIds.length) roots.push(nodeIds[0]!);

  const depthById = new Map<string, number>();
  const queue: string[] = [];

  for (const id of roots) {
    depthById.set(id, 0);
    queue.push(id);
  }

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    const depth = depthById.get(id) ?? 0;
    for (const child of outgoing.get(id) ?? []) {
      const nextDepth = depth + 1;
      const prevDepth = depthById.get(child);
      if (prevDepth == null || nextDepth < prevDepth) {
        depthById.set(child, nextDepth);
        queue.push(child);
      }
    }
  }

  let maxDepth = 0;
  for (const d of depthById.values()) maxDepth = Math.max(maxDepth, d);

  for (const id of nodeIds) {
    if (depthById.has(id)) continue;
    maxDepth += 1;
    depthById.set(id, maxDepth);
  }

  const layerCounts = new Map<number, number>();
  for (const id of nodeIds) {
    const depth = depthById.get(id) ?? 0;
    layerCounts.set(depth, (layerCounts.get(depth) ?? 0) + 1);
  }

  let breadth = 1;
  for (const count of layerCounts.values()) breadth = Math.max(breadth, count);
  const depth = Math.max(1, maxDepth + 1);

  return { depth, breadth };
}

function axisScore(axis: Axis, depth: number, breadth: number, containerAspect: number): number {
  const graphAspect = axis === 'vertical' ? breadth / depth : depth / breadth;
  return Math.abs(Math.log(Math.max(graphAspect, MIN_VALUE)) - Math.log(Math.max(containerAspect, MIN_VALUE)));
}

export function resolveAutoDirection({
  nodes,
  edges,
  containerWidth,
  containerHeight,
  preferredDirection,
  previousDirection,
  hysteresis = DEFAULT_HYSTERESIS,
}: ResolveAutoDirectionParams): Direction {
  if (nodes.length <= 1) return preferredDirection;
  if (!(containerWidth > 0) || !(containerHeight > 0)) return preferredDirection;

  const { depth, breadth } = estimateGraphShape(nodes, edges);
  const containerAspect = containerWidth / containerHeight;

  const verticalScore = axisScore('vertical', depth, breadth, containerAspect);
  const horizontalScore = axisScore('horizontal', depth, breadth, containerAspect);

  const previousAxis = axisFromDirection(previousDirection ?? preferredDirection);
  if (Math.abs(verticalScore - horizontalScore) <= hysteresis) {
    return directionForAxis(previousAxis, preferredDirection);
  }

  const bestAxis: Axis = horizontalScore < verticalScore ? 'horizontal' : 'vertical';
  return directionForAxis(bestAxis, preferredDirection);
}
