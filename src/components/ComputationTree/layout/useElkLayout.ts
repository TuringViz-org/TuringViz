import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Elk, { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';

import { CONFIG_NODE_DIAMETER } from '../util/constants';
import type { CTNode, CTEdge } from '../util/buildComputationTree';

export type ElkAlgo = 'layered' | 'force' | 'mrtree' | 'stress' | 'radial';

export type Options = {
  algorithm?: ElkAlgo;
  nodeSep?: number;
  rankSep?: number;
  edgeSep?: number;
  edgeNodeSep?: number;
  padding?: number;
  direction?: 'RIGHT' | 'LEFT' | 'UP' | 'DOWN';
};

export type LayoutAPI = {
  restart: () => void;
  running: boolean;
};

type Params = Options & {
  nodes: CTNode[];
  edges: CTEdge[];
  onLayout: (positions: Map<string, { x: number; y: number }>) => void;
};

const makeTopoKey = (nodes: CTNode[], edges: CTEdge[]) => {
  const nIds = [...nodes.map((n) => n.id)].sort().join('|');
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
};

export function useElkLayout({
  nodes,
  edges,
  onLayout,
  algorithm = 'layered',
  nodeSep = 70,
  rankSep = 120,
  edgeSep = 24,
  edgeNodeSep = 100,
  padding = 24,
  direction = 'DOWN',
}: Params): LayoutAPI {
  const elkRef = useRef<InstanceType<typeof Elk> | null>(null);
  const [running, setRunning] = useState(false);
  const lastTopoKeyRef = useRef<string>('');
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  if (!elkRef.current) elkRef.current = new Elk();

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  const topoKey = useMemo(() => makeTopoKey(nodes, edges), [nodes, edges]);

  const runLayout = useCallback(async () => {
    const elk = elkRef.current!;
    const rfNodes = nodesRef.current;
    const rfEdges = edgesRef.current;

    if (!rfNodes.length) return;

    setRunning(true);

    const elkNodes: ElkNode[] = rfNodes.map((n) => ({
      id: n.id,
      width: Math.max(1, n.width ?? CONFIG_NODE_DIAMETER),
      height: Math.max(1, n.height ?? CONFIG_NODE_DIAMETER),
    }));

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
        'elk.direction': direction,
        'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      },
      children: elkNodes,
      edges: elkEdges,
    };

    try {
      const res = await elk.layout(elkGraph);
      const posById = new Map<string, { x: number; y: number }>();
      for (const c of res.children ?? []) {
        if (!c.id) continue;
        posById.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
      }
      onLayout(posById);
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
    onLayout,
  ]);

  const restart = useCallback(() => {
    lastTopoKeyRef.current = '';
    void runLayout();
  }, [runLayout]);

  useEffect(() => {
    if (!nodes.length) return;
    if (lastTopoKeyRef.current === topoKey) return;
    lastTopoKeyRef.current = topoKey;
    void runLayout();
  }, [nodes.length, topoKey, runLayout]);

  return { restart, running };
}
