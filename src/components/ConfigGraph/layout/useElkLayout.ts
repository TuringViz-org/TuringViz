// src/components/ConfigGraph/layout/useElkLayout.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Elk, { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
import {
  useNodesInitialized,
  useReactFlow,
  useStore,
  type ReactFlowState,
} from '@xyflow/react';

import { CONFIG_NODE_DIAMETER } from '../util/constants';
import {
  createElkWithWorker,
  resolveElkAlgorithm,
  type ElkAlgo,
} from '@components/shared/layout/elkUtils';
import { resolveAutoDirection } from '@components/shared/layout/autoDirection';
import { scaleToContainer } from '@components/shared/layout/scaleToContainer';
import { buildSinglePathLayout } from '@components/shared/layout/singlePathLayout';

export type Options = {
  algorithm?: ElkAlgo;
  nodeSep?: number; // spacing between nodes in the same layer
  rankSep?: number; // spacing between layers
  edgeSep?: number; // spacing between edges
  edgeNodeSep?: number; // spacing between edges and nodes
  padding?: number; // graph padding
  maxAxisScale?: number;
  direction?: 'RIGHT' | 'LEFT' | 'UP' | 'DOWN';
  autoDirection?: boolean;
  scaleToFit?: boolean;
  autoResizeLayoutEnabled?: boolean;
};

export type LayoutAPI = {
  restart: () => void; // Recalculate layout now
  running: boolean; // Is ELK currently computing?
};

const elementCountSelector = (s: ReactFlowState) => s.nodes.length + s.edges.length;
const viewportWidthSelector = (s: ReactFlowState) => s.width;
const viewportHeightSelector = (s: ReactFlowState) => s.height;

export function useElkLayout({
  algorithm = 'layered',
  nodeSep = 70,
  rankSep = 120,
  edgeSep = 24,
  edgeNodeSep = 100,
  padding = 24,
  maxAxisScale,
  direction = 'DOWN',
  autoDirection = true,
  scaleToFit = false,
  autoResizeLayoutEnabled = true,
}: Options = {}): LayoutAPI {
  const nodesInitialized = useNodesInitialized();
  const elementCount = useStore(elementCountSelector);
  const viewportWidth = useStore(viewportWidthSelector);
  const viewportHeight = useStore(viewportHeightSelector);
  const { getNodes, getEdges, setNodes } = useReactFlow();

  const elkRef = useRef<InstanceType<typeof Elk> | null>(null);
  const [running, setRunning] = useState(false);
  const lastTopoKeyRef = useRef<string>('');
  const workerGraphKeyRef = useRef<string>('');
  const lastDirectionRef = useRef<NonNullable<Options['direction']>>(direction);
  const lastSizeKeyRef = useRef<string>('');

  // Create ELK instance once (kept across renders)
  if (!elkRef.current) elkRef.current = createElkWithWorker('config-graph-elk-layout-worker');

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

  const runLayout = useCallback(async () => {
    const rfNodes = getNodes();
    const rfEdges = getEdges();

    if (!rfNodes.length) return;

    const containerWidth =
      viewportWidth > 0
        ? viewportWidth
        : typeof window !== 'undefined'
          ? window.innerWidth
          : 1;
    const containerHeight =
      viewportHeight > 0
        ? viewportHeight
        : typeof window !== 'undefined'
          ? window.innerHeight
          : 1;
    const effectiveDirection = autoDirection
      ? resolveAutoDirection({
          nodes: rfNodes,
          edges: rfEdges,
          containerWidth,
          containerHeight,
          preferredDirection: direction,
          previousDirection: lastDirectionRef.current,
        })
      : direction;
    lastDirectionRef.current = effectiveDirection;

    setRunning(true);
    try {
      const manualPathPositions = buildSinglePathLayout(
        rfNodes.map((n) => ({
          id: String(n.id),
          width: n.measured?.width ?? CONFIG_NODE_DIAMETER,
          height: n.measured?.height ?? CONFIG_NODE_DIAMETER,
        })),
        rfEdges.map((e) => ({ source: String(e.source), target: String(e.target) })),
        {
          direction: effectiveDirection,
          padding,
          nodeSep,
          rankSep,
          edgeSep,
          edgeNodeSep,
        }
      );

      if (manualPathPositions) {
        const nextPositions =
          autoDirection && scaleToFit
            ? scaleToContainer({
                positions: manualPathPositions,
                containerWidth,
                containerHeight,
                maxAxisScale,
              })
            : manualPathPositions;

        setNodes((prev) =>
          prev.map((n) => {
            const p = nextPositions.get(n.id);
            if (!p) return n;
            const same = n.position?.x === p.x && n.position?.y === p.y;
            return same ? n : { ...n, position: p };
          })
        );
        // Keep the running=true -> running=false transition observable by React effects.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        return;
      }

      if (workerGraphKeyRef.current !== topoKey) {
        elkRef.current?.terminateWorker();
        elkRef.current = createElkWithWorker('config-graph-elk-layout-worker');
        workerGraphKeyRef.current = topoKey;
      }

      const elk = elkRef.current!;
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
            resolveElkAlgorithm(algorithm),
          'elk.spacing.nodeNode': String(nodeSep),
          'elk.layered.spacing.nodeNodeBetweenLayers': String(rankSep),
          'elk.spacing.edgeEdge': String(edgeSep),
          'elk.spacing.edgeNode': String(edgeNodeSep),
          'elk.padding': String(padding),
          // Dynamically swap orientation to better use viewport space.
          'elk.direction': effectiveDirection,
          // Balanced node placement to reduce long sweeps
          'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
        },
        children: elkNodes,
        edges: elkEdges,
      };

      const res = await elk.layout(elkGraph);

      // Result: Update RF nodes (only map positions)
      const posById = new Map<string, { x: number; y: number }>();
      for (const c of res.children ?? []) {
        if (!c.id) continue;
        posById.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
      }
      const nextPositions =
        autoDirection && scaleToFit
          ? scaleToContainer({
              positions: posById,
              containerWidth,
              containerHeight,
              maxAxisScale,
            })
          : posById;

      setNodes((prev) =>
        prev.map((n) => {
          const p = nextPositions.get(n.id);
          if (!p) return n;
          const same = n.position?.x === p.x && n.position?.y === p.y;
          return same ? n : { ...n, position: p };
        })
      );
    } finally {
      setRunning(false);
    }
  }, [
    topoKey,
    getNodes,
    getEdges,
    setNodes,
    viewportWidth,
    viewportHeight,
    direction,
    autoDirection,
    scaleToFit,
    algorithm,
    nodeSep,
    rankSep,
    edgeSep,
    edgeNodeSep,
    padding,
    maxAxisScale,
  ]);

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
  }, [nodesInitialized, topoKey, runLayout]);

  const sizeKey = useMemo(
    () => `${Math.max(1, Math.round(viewportWidth / 80))}x${Math.max(1, Math.round(viewportHeight / 80))}`,
    [viewportWidth, viewportHeight]
  );

  useEffect(() => {
    if (!autoDirection) return;
    if (!autoResizeLayoutEnabled) return;
    if (!nodesInitialized) return;
    if (getNodes().length === 0) return;
    if (viewportWidth <= 0 || viewportHeight <= 0) return;

    if (lastSizeKeyRef.current === sizeKey) return;
    const hadPreviousSize = lastSizeKeyRef.current !== '';
    lastSizeKeyRef.current = sizeKey;
    if (!hadPreviousSize) return;

    void runLayout();
  }, [autoDirection, autoResizeLayoutEnabled, nodesInitialized, sizeKey, getNodes, runLayout]);

  useEffect(() => {
    lastDirectionRef.current = direction;
  }, [direction]);

  return { restart, running };
}
