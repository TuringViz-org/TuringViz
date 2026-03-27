export type LayoutDirection = 'RIGHT' | 'LEFT' | 'UP' | 'DOWN';

export type PathLayoutNode = {
  id: string;
  width: number;
  height: number;
};

export type PathLayoutEdge = {
  source: string;
  target: string;
};

export type SinglePathLayoutOptions = {
  direction: LayoutDirection;
  padding: number;
  nodeSep: number;
  rankSep: number;
  edgeSep: number;
  edgeNodeSep: number;
};

function normalizeSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeSpacing(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function isHorizontal(direction: LayoutDirection): boolean {
  return direction === 'RIGHT' || direction === 'LEFT';
}

function isReverseDirection(direction: LayoutDirection): boolean {
  return direction === 'LEFT' || direction === 'UP';
}

export function buildSinglePathLayout(
  nodes: PathLayoutNode[],
  edges: PathLayoutEdge[],
  options: SinglePathLayoutOptions
): Map<string, { x: number; y: number }> | null {
  if (nodes.length === 0) return null;

  const nodeById = new Map<string, PathLayoutNode>();
  for (const node of nodes) {
    const id = String(node.id);
    if (nodeById.has(id)) return null;
    nodeById.set(id, {
      id,
      width: normalizeSize(node.width),
      height: normalizeSize(node.height),
    });
  }

  const nodeIds = Array.from(nodeById.keys());
  const nodeSet = new Set(nodeIds);
  const nextById = new Map<string, string>();
  const prevById = new Map<string, string>();
  const uniqueEdges = new Set<string>();

  for (const edge of edges) {
    const source = String(edge.source);
    const target = String(edge.target);
    if (source === target) continue;
    if (!nodeSet.has(source) || !nodeSet.has(target)) continue;

    const key = `${source}->${target}`;
    if (uniqueEdges.has(key)) continue;
    uniqueEdges.add(key);

    if (nextById.has(source) || prevById.has(target)) return null;
    nextById.set(source, target);
    prevById.set(target, source);
  }

  if (nodeIds.length === 1) {
    if (uniqueEdges.size !== 0) return null;
  } else if (uniqueEdges.size !== nodeIds.length - 1) {
    return null;
  }

  const starts = nodeIds.filter((id) => !prevById.has(id));
  const ends = nodeIds.filter((id) => !nextById.has(id));
  if (starts.length !== 1 || ends.length !== 1) return null;

  const pathOrder: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = starts[0];
  while (current) {
    if (visited.has(current)) return null;
    visited.add(current);
    pathOrder.push(current);
    current = nextById.get(current);
  }

  if (pathOrder.length !== nodeIds.length) return null;
  if (pathOrder[pathOrder.length - 1] !== ends[0]) return null;

  const direction = options.direction;
  const padding = normalizeSpacing(options.padding);
  const majorGap =
    normalizeSpacing(options.rankSep) +
    Math.round(
      (normalizeSpacing(options.nodeSep) +
        normalizeSpacing(options.edgeSep) +
        normalizeSpacing(options.edgeNodeSep)) /
        4
    );
  const horizontal = isHorizontal(direction);
  const visualOrder = isReverseDirection(direction) ? [...pathOrder].reverse() : pathOrder;
  const maxMinor = Math.max(
    1,
    ...visualOrder.map((id) => {
      const node = nodeById.get(id)!;
      return horizontal ? node.height : node.width;
    })
  );

  const positions = new Map<string, { x: number; y: number }>();
  let cursor = padding;
  for (const id of visualOrder) {
    const node = nodeById.get(id)!;
    const major = horizontal ? node.width : node.height;
    const minor = horizontal ? node.height : node.width;
    const cross = padding + (maxMinor - minor) / 2;
    positions.set(id, horizontal ? { x: cursor, y: cross } : { x: cross, y: cursor });
    cursor += major + majorGap;
  }

  return positions;
}
