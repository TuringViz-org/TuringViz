// src/components/TMGraph/layout/useElkLayout.ts
import { useRef, useState } from 'react';
import Elk, { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
import { Node as RFNode, useReactFlow } from '@xyflow/react';

import { STATE_NODE_DIAMETER } from '../util/constants';

export type ElkAlgo = 'layered' | 'force' | 'mrtree' | 'stress' | 'radial';

export type Options = {
  algorithm?: ElkAlgo;
  nodeSep?: number; // spacing between nodes in the same layer
  rankSep?: number; // spacing between layers
  edgeSep?: number; // spacing between edges
  padding?: number; // graph padding
  direction?: 'RIGHT' | 'LEFT' | 'UP' | 'DOWN';
};

export type LayoutAPI = {
  restart: () => void; // Recalculate layout
  running: boolean; // Is ELK currently computing?
};

export function useElkLayout({
  algorithm = 'layered',
  nodeSep = 60,
  rankSep = 100,
  edgeSep = 24,
  padding = 20,
  direction = 'RIGHT',
}: Options = {}): LayoutAPI {
  const { getNodes, getEdges, setNodes } = useReactFlow();

  const elkRef = useRef<InstanceType<typeof Elk> | null>(null);
  const [running, setRunning] = useState(false);

  // Create ELK instance once
  if (!elkRef.current) elkRef.current = new Elk();

  const runLayout = async () => {
    const elk = elkRef.current!;
    const rfNodes = getNodes();
    const rfEdges = getEdges();

    if (!rfNodes.length) return;

    setRunning(true);

    // Prepare ELK graph (position-only layout)
    const elkNodes: ElkNode[] = rfNodes.map((n) => ({
      id: n.id,
      width: n.width ?? STATE_NODE_DIAMETER,
      height: n.height ?? STATE_NODE_DIAMETER,
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
        // Algorithm
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
        // Distances
        'elk.spacing.nodeNode': String(nodeSep),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(rankSep),
        'elk.spacing.edgeEdge': String(edgeSep),
        // Padding
        'elk.padding': String(padding),
        // Other options
        'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
        'elk.direction': direction,
      },
      children: elkNodes,
      edges: elkEdges,
    };

    try {
      const res = await elk.layout(elkGraph);

      // Result: Update RF nodes (only map positions)
      const posById = new Map<string, { x: number; y: number }>();
      for (const c of res.children ?? []) {
        posById.set(c.id!, { x: c.x ?? 0, y: c.y ?? 0 });
      }

      setNodes((prev: RFNode[]) =>
        prev.map((n) => {
          const p = posById.get(n.id);
          return p ? { ...n, position: p } : n;
        })
      );
    } finally {
      setRunning(false);
    }
  };

  // Fit view after layout if requested
  const restart = () => {
    runLayout();
  };

  return { restart, running };
}
