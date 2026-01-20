// src/components/ConfigGraph/layout/useElkLayout.ts
import { useEffect, useMemo, useRef, useState } from 'react';
import Elk, { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
import {
  type Node as RFNode,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type ReactFlowState,
} from '@xyflow/react';

import { CONFIG_NODE_DIAMETER } from '../util/constants';

const createElkWithWorker = () => {
  if (typeof Worker === 'undefined') return new Elk();

  return new Elk({
    workerFactory: () =>
      new Worker(new URL('elkjs/lib/elk-worker.js', import.meta.url), {
        name: 'elk-layout-worker',
      }),
  });
};

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

const elementCountSelector = (s: ReactFlowState) => s.nodes.length + s.edges.length;

export function useElkLayout({
  algorithm = 'layered',
  nodeSep = 70,
  rankSep = 120,
  edgeSep = 24,
  edgeNodeSep = 100,
  padding = 24,
  direction = 'DOWN',
}: Options = {}): LayoutAPI {
  const nodesInitialized = useNodesInitialized();
  const elementCount = useStore(elementCountSelector);
  const { getNodes, getEdges, setNodes } = useReactFlow();

  const elkRef = useRef<InstanceType<typeof Elk> | null>(null);
  const [running, setRunning] = useState(false);
  const lastTopoKeyRef = useRef<string>('');
  const workerGraphKeyRef = useRef<string>('');

  // Create ELK instance once (kept across renders)
  if (!elkRef.current) elkRef.current = createElkWithWorker();

  useEffect(
    () => () => {
      elkRef.current?.terminateWorker();
      elkRef.current = null;
      workerGraphKeyRef.current = '';
    },
    []
  );

  // Topology key: only node IDs + (unique) source→target pairs
  // This keeps layout re-runs limited to actual structure changes.
  const topoKey = useMemo(() => {
    const ns = getNodes();
    const es = getEdges();

    const nIds = ns
      .map((n) => n.id)
      .sort()
      .join('|');

    // Collapse parallel edges to a unique set of source→target identifiers
    const ePairs = Array.from(
      new Set(
        es.filter((e) => e.source !== e.target).map((e) => `${e.source}→${e.target}`)
      )
    )
      .sort()
      .join('|');

    return `${nIds}__${ePairs}`;
  }, [elementCount]);

  const runLayout = async () => {
    if (workerGraphKeyRef.current !== topoKey) {
      elkRef.current?.terminateWorker();
      elkRef.current = createElkWithWorker();
      workerGraphKeyRef.current = topoKey;
    }

    const elk = elkRef.current!;
    const rfNodes = getNodes();
    const rfEdges = getEdges();

    if (!rfNodes.length) return;

    setRunning(true);

    // Prepare ELK graph (position-only layout)
    const elkNodes: ElkNode[] = rfNodes.map((n) => ({
      id: n.id,
      width: n.measured?.width ?? CONFIG_NODE_DIAMETER,
      height: n.measured?.height ?? CONFIG_NODE_DIAMETER,
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

      setNodes((prev) =>
        prev.map((n) => {
          const p = posById.get(n.id);
          if (!p) return n;
          const same = n.position?.x === p.x && n.position?.y === p.y;
          return same ? n : { ...n, position: p };
        })
      );
    } finally {
      setRunning(false);
    }
  };

  // Fit view after layout if requested
  const restart = () => {
    lastTopoKeyRef.current = '';
    void runLayout();
  };

  // Automatically recalculate when the topology changes
  useEffect(() => {
    if (!nodesInitialized) return;
    if (lastTopoKeyRef.current === topoKey) return;
    lastTopoKeyRef.current = topoKey;
    void runLayout();
  }, [nodesInitialized, topoKey]);

  return { restart, running };
}
