// src/components/ComputationTree/layout/useElkLayout.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Elk, { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { toast } from 'sonner';

import {
  CONFIG_NODE_DIAMETER,
} from '../util/constants';
import {
  createElkWithWorker,
  resolveElkAlgorithm,
  type ElkAlgo,
} from '@components/shared/layout/elkUtils';

type FallbackLayoutParams = {
  nodeSep: number;
  rankSep: number;
  padding: number;
  direction: 'RIGHT' | 'LEFT' | 'UP' | 'DOWN';
};

function buildFallbackPositions(
  rfNodes: RFNode[],
  rfEdges: RFEdge[],
  { nodeSep, rankSep, padding, direction }: FallbackLayoutParams
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

  const maxWidth = Math.max(
    CONFIG_NODE_DIAMETER,
    ...rfNodes.map((n) => n.measured?.width ?? CONFIG_NODE_DIAMETER)
  );
  const maxHeight = Math.max(
    CONFIG_NODE_DIAMETER,
    ...rfNodes.map((n) => n.measured?.height ?? CONFIG_NODE_DIAMETER)
  );
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

export type Options = {
  algorithm?: ElkAlgo;
  nodeSep?: number; // spacing between nodes in the same layer
  rankSep?: number; // spacing between layers
  edgeSep?: number; // spacing between edges
  edgeNodeSep?: number; // spacing between edges and nodes
  padding?: number; // graph padding
  direction?: 'RIGHT' | 'LEFT' | 'UP' | 'DOWN';
  topoKeyOverride?: string;
  autoRun?: boolean;
};

export type LayoutAPI = {
  restart: () => void; // Recalculate layout now
  running: boolean; // Is ELK currently computing?
};

export function useElkLayout({
  nodes,
  edges,
  algorithm = 'layered',
  nodeSep = 70,
  rankSep = 120,
  edgeSep = 24,
  edgeNodeSep = 100,
  padding = 24,
  direction = 'DOWN',
  topoKeyOverride,
  autoRun = true,
  onLayout,
}: Options & {
  nodes: RFNode[];
  edges: RFEdge[];
  onLayout: (positions: Map<string, { x: number; y: number }>) => void;
}): LayoutAPI {
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const onLayoutRef = useRef(onLayout);

  const elkRef = useRef<InstanceType<typeof Elk> | null>(null);
  const [running, setRunning] = useState(false);
  const lastTopoKeyRef = useRef<string>('');
  const workerGraphKeyRef = useRef<string>('');
  const lastFailureToastTopoKeyRef = useRef<string>('');

  // Create ELK instance once (kept across renders)
  if (!elkRef.current) elkRef.current = createElkWithWorker('computation-tree-elk-layout-worker');

  useEffect(
    () => () => {
      elkRef.current?.terminateWorker();
      elkRef.current = null;
      workerGraphKeyRef.current = '';
    },
    []
  );

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    onLayoutRef.current = onLayout;
  }, [nodes, edges, onLayout]);

  // Topology key: only node IDs + (unique) source→target pairs
  // This keeps layout re-runs limited to actual structure changes.
  const topoKey = useMemo(() => {
    if (topoKeyOverride != null) return topoKeyOverride;
    const nIds = nodes
      .map((n) => n.id)
      .sort((a, b) => a.localeCompare(b))
      .join('|');

    // Collapse parallel edges to a unique set of source→target identifiers
    const ePairs = Array.from(
      new Set(
        edges
          .filter((e) => e.source !== e.target)
          .map((e) => `${e.source}→${e.target}`)
      )
    )
      .sort()
      .join('|');

    return `${nIds}__${ePairs}`;
  }, [nodes, edges, topoKeyOverride]);

  const runLayout = useCallback(async () => {
    if (workerGraphKeyRef.current !== topoKey) {
      elkRef.current?.terminateWorker();
      elkRef.current = createElkWithWorker('computation-tree-elk-layout-worker');
      workerGraphKeyRef.current = topoKey;
    }

    const elk = elkRef.current!;
    const rfNodes = nodesRef.current;
    const rfEdges = edgesRef.current;

    if (!rfNodes.length) return;

    setRunning(true);

    // Prepare ELK graph (position-only layout)
    const elkNodes: ElkNode[] = rfNodes.map((n) => ({
      id: n.id,
      width: n.measured?.width ?? CONFIG_NODE_DIAMETER,
      height: n.measured?.height ?? CONFIG_NODE_DIAMETER,
    }));

    const nodeIds = new Set(elkNodes.map((n) => n.id));
    // Only include edges that are not self-references
    const elkEdges: ElkExtendedEdge[] = [];
    const seenEdgeIds = new Set<string>();
    for (const edge of rfEdges) {
      const source = String(edge.source);
      const target = String(edge.target);
      if (source === target) continue;
      if (!nodeIds.has(source) || !nodeIds.has(target)) continue;

      // Keep edge ids stable and unique for ELK.
      const edgeId = String(edge.id || `${source}→${target}`);
      if (seenEdgeIds.has(edgeId)) continue;
      seenEdgeIds.add(edgeId);

      elkEdges.push({
        id: edgeId,
        sources: [source],
        targets: [target],
      });
    }

    const elkGraph: ElkNode = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm':
          resolveElkAlgorithm(algorithm),
        'elk.spacing.nodeNode': String(nodeSep),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(rankSep),
        'elk.spacing.edgeEdge': String(edgeSep),
        'elk.spacing.edgeNode': String(edgeNodeSep),
        'elk.padding': String(padding),
        // Place layers in a fixed direction to match the UI mental model
        'elk.direction': direction,
        // Balanced node placement to reduce long sweeps
        'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      },
      children: elkNodes,
      edges: elkEdges,
    };

    try {
      const res = await elk.layout(elkGraph);

      // Result: Update RF nodes (only map positions)
      const posById = new Map<string, { x: number; y: number }>();
      for (const c of res.children ?? []) {
        if (!c.id) continue;
        posById.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
      }

      onLayoutRef.current?.(posById);
    } catch {
      if (lastFailureToastTopoKeyRef.current !== topoKey) {
        lastFailureToastTopoKeyRef.current = topoKey;
        toast.warning('Layout failed. Please try again with fewer nodes.');
      }
      // ELK may throw on very deep/wide trees (e.g. self-loop-heavy examples).
      // Fall back to a deterministic layered layout so nodes stay visible.
      try {
        const fallbackPositions = buildFallbackPositions(rfNodes, rfEdges, {
          nodeSep,
          rankSep,
          padding,
          direction,
        });
        onLayoutRef.current?.(fallbackPositions);
      } catch {
        // Last-resort placement: keep nodes visible in a simple grid.
        const emergencyPositions = new Map<string, { x: number; y: number }>();
        const spacingX = CONFIG_NODE_DIAMETER + Math.max(24, nodeSep);
        const spacingY = CONFIG_NODE_DIAMETER + Math.max(24, rankSep);
        const columns = 20;
        for (let i = 0; i < rfNodes.length; i++) {
          const n = rfNodes[i]!;
          emergencyPositions.set(String(n.id), {
            x: padding + (i % columns) * spacingX,
            y: padding + Math.floor(i / columns) * spacingY,
          });
        }
        onLayoutRef.current?.(emergencyPositions);
      }
    } finally {
      setRunning(false);
    }
  }, [
    algorithm,
    nodeSep,
    rankSep,
    edgeSep,
    edgeNodeSep,
    padding,
    direction,
    topoKey,
  ]);

  // Fit view after layout if requested
  const restart = () => {
    lastTopoKeyRef.current = '';
    void runLayout();
  };

  // Automatically recalculate when the topology changes
  useEffect(() => {
    if (!autoRun) return;
    if (lastTopoKeyRef.current === topoKey) return;
    lastTopoKeyRef.current = topoKey;
    void runLayout();
  }, [topoKey, runLayout, autoRun]);

  return { restart, running };
}
