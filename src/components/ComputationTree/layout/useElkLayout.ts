// src/components/ConfigGraph/layout/useElkLayout.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Elk, { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

import {
  CONFIG_CARD_HEIGHT_ESTIMATE,
  CONFIG_NODE_DIAMETER,
  NodeType,
} from '../util/constants';

export type ElkAlgo = 'layered' | 'force' | 'mrtree' | 'stress' | 'radial';

export type Options = {
  algorithm?: ElkAlgo;
  nodeSep?: number; // spacing between nodes in the same layer
  rankSep?: number; // spacing between layers
  edgeSep?: number; // spacing between edges
  edgeNodeSep?: number; // spacing between edges and nodes
  padding?: number; // graph padding
  direction?: 'RIGHT' | 'LEFT' | 'UP' | 'DOWN';
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

  // Create ELK instance once (kept across renders)
  if (!elkRef.current) elkRef.current = new Elk();

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    onLayoutRef.current = onLayout;
  }, [nodes, edges, onLayout]);

  // Topology key: only node IDs + (unique) source→target pairs
  // This keeps layout re-runs limited to actual structure changes.
  const topoKey = useMemo(() => {
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
  }, [nodes, edges]);

  const runLayout = useCallback(async () => {
    const elk = elkRef.current!;
    const rfNodes = nodesRef.current;
    const rfEdges = edgesRef.current;

    if (!rfNodes.length) return;

    setRunning(true);

    // Prepare ELK graph (position-only layout)
    const elkNodes: ElkNode[] = rfNodes.map((n) => ({
      id: n.id,
      width: n.measured?.width ?? n.width ?? CONFIG_NODE_DIAMETER,
      height:
        n.measured?.height ??
        n.height ??
        (n.type === NodeType.CONFIG_CARD
          ? CONFIG_CARD_HEIGHT_ESTIMATE
          : CONFIG_NODE_DIAMETER),
    }));

    // Only include edges that are not self-references
    const elkEdges: ElkExtendedEdge[] = rfEdges
      .filter((e) => e.source !== e.target)
      .map((e) => ({
        id: `${e.source}→${e.target}`,
        sources: [String(e.source)],
        targets: [String(e.target)],
      }));

    const elkGraph: ElkNode = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm':
          algorithm === 'layered'
            ? 'layered'
            : algorithm === 'radial'
              ? 'radial'
              : algorithm === 'mrtree'
                ? 'mrtree'
                : algorithm === 'stress'
                  ? 'stress'
                  : 'force',
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
  ]);

  // Fit view after layout if requested
  const restart = () => {
    lastTopoKeyRef.current = '';
    void runLayout();
  };

  // Automatically recalculate when the topology changes
  useEffect(() => {
    if (lastTopoKeyRef.current === topoKey) return;
    lastTopoKeyRef.current = topoKey;
    void runLayout();
  }, [topoKey, runLayout]);

  return { restart, running };
}
