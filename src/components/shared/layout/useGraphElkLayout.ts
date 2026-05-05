import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Elk, { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api.js';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { toast } from 'sonner';

import {
  createElkWithWorker,
  runElkLayoutWithTimeout,
  resolveElkAlgorithm,
  type ElkAlgo,
} from '@components/shared/layout/elkUtils';
import { resolveAutoDirection } from '@components/shared/layout/autoDirection';
import { scaleToContainer } from '@components/shared/layout/scaleToContainer';
import { buildSinglePathLayout } from '@components/shared/layout/singlePathLayout';

type FallbackLayoutParams = {
  nodeSep: number;
  rankSep: number;
  padding: number;
  direction: 'RIGHT' | 'LEFT' | 'UP' | 'DOWN';
};

const ELK_LAYOUT_TIMEOUT_MS = 12000;
const DEFAULT_NODE_SIZE = 64;

export type NodeLayoutSize = { width: number; height: number };
export type NodeLayoutSizeResolver = (node: RFNode) => NodeLayoutSize;

function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function isElementHidden(element: Element | null | undefined): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return element.clientWidth <= 0 || element.clientHeight <= 0;
}

function buildTopoKeyFromElements(rfNodes: RFNode[], rfEdges: RFEdge[]): string {
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

function getDefaultNodeLayoutSize(node: RFNode): NodeLayoutSize {
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

  const maxWidth = Math.max(
    DEFAULT_NODE_SIZE,
    ...rfNodes.map((n) => getNodeLayoutSize(n).width)
  );
  const maxHeight = Math.max(
    DEFAULT_NODE_SIZE,
    ...rfNodes.map((n) => getNodeLayoutSize(n).height)
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
  maxAxisScale?: number;
  direction?: 'RIGHT' | 'LEFT' | 'UP' | 'DOWN';
  containerRef?: { current: Element | null };
  viewportWidth?: number;
  viewportHeight?: number;
  autoDirection?: boolean;
  scaleToFit?: boolean;
  topoKeyOverride?: string;
  autoRun?: boolean;
  autoResizeLayoutEnabled?: boolean;
  onAutoResizeLayout?: () => boolean | void;
  getNodeLayoutSize?: NodeLayoutSizeResolver;
  workerName?: string;
};

export type LayoutAPI = {
  restart: () => void; // Recalculate layout now
  running: boolean; // Is ELK currently computing?
  completedLayouts: number; // Increments after a current layout result was applied
};

export function useGraphElkLayout({
  nodes,
  edges,
  algorithm = 'layered',
  nodeSep = 70,
  rankSep = 120,
  edgeSep = 24,
  edgeNodeSep = 100,
  padding = 24,
  maxAxisScale,
  direction = 'DOWN',
  containerRef,
  viewportWidth,
  viewportHeight,
  autoDirection = true,
  scaleToFit = false,
  topoKeyOverride,
  autoRun = true,
  autoResizeLayoutEnabled = true,
  onAutoResizeLayout,
  getNodeLayoutSize = getDefaultNodeLayoutSize,
  workerName = 'graph-elk-layout-worker',
  onLayout,
}: Options & {
  nodes: RFNode[];
  edges: RFEdge[];
  onLayout: (positions: Map<string, { x: number; y: number }>) => void;
}): LayoutAPI {
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const onLayoutRef = useRef(onLayout);
  const onAutoResizeLayoutRef = useRef(onAutoResizeLayout);
  const getNodeLayoutSizeRef = useRef(getNodeLayoutSize);

  const elkRef = useRef<InstanceType<typeof Elk> | null>(null);
  const [running, setRunning] = useState(false);
  const [completedLayouts, setCompletedLayouts] = useState(0);
  const lastTopoKeyRef = useRef<string>('');
  const workerGraphKeyRef = useRef<string>('');
  const lastFailureToastTopoKeyRef = useRef<string>('');
  const [observedContainerSize, setObservedContainerSize] = useState({
    width: 0,
    height: 0,
  });
  const lastDirectionRef = useRef(direction);
  const lastSizeKeyRef = useRef<string>('');
  const isRunningRef = useRef(false);
  const rerunRequestedRef = useRef(false);
  const latestRequestIdRef = useRef(0);
  const retryWhenVisibleRef = useRef(false);
  const isMountedRef = useRef(true);

  // Create ELK instance once (kept across renders)
  if (!elkRef.current) elkRef.current = createElkWithWorker(workerName);

  useEffect(
    () => () => {
      isMountedRef.current = false;
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
    onAutoResizeLayoutRef.current = onAutoResizeLayout;
    getNodeLayoutSizeRef.current = getNodeLayoutSize;
  }, [nodes, edges, onLayout, onAutoResizeLayout, getNodeLayoutSize]);

  useEffect(() => {
    const element = containerRef?.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const update = () => {
      if (element.clientWidth <= 0 || element.clientHeight <= 0) return;
      setObservedContainerSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    lastDirectionRef.current = direction;
  }, [direction]);

  const resetElkWorker = useCallback(() => {
    elkRef.current?.terminateWorker();
    elkRef.current = createElkWithWorker(workerName);
    workerGraphKeyRef.current = '';
  }, [workerName]);

  // Topology key: only node IDs + (unique) source→target pairs
  // This keeps layout re-runs limited to actual structure changes.
  const topoKey = useMemo(() => {
    if (topoKeyOverride != null) return topoKeyOverride;
    return buildTopoKeyFromElements(nodes, edges);
  }, [nodes, edges, topoKeyOverride]);

  const effectiveViewportWidth =
    viewportWidth && viewportWidth > 0
      ? viewportWidth
      : observedContainerSize.width > 0
        ? observedContainerSize.width
        : typeof window !== 'undefined'
          ? window.innerWidth
          : 1;
  const effectiveViewportHeight =
    viewportHeight && viewportHeight > 0
      ? viewportHeight
      : observedContainerSize.height > 0
        ? observedContainerSize.height
        : typeof window !== 'undefined'
          ? window.innerHeight
          : 1;
  const viewportSizeKey = useMemo(
    () =>
      `${Math.max(1, Math.round(effectiveViewportWidth / 80))}x${Math.max(
        1,
        Math.round(effectiveViewportHeight / 80)
      )}`,
    [effectiveViewportWidth, effectiveViewportHeight]
  );

  const runLayout = useCallback(async () => {
    latestRequestIdRef.current += 1;
    if (isRunningRef.current) {
      rerunRequestedRef.current = true;
      return;
    }

    isRunningRef.current = true;
    if (isMountedRef.current) setRunning(true);
    try {
      while (true) {
        rerunRequestedRef.current = false;

        const rfNodes = nodesRef.current;
        const rfEdges = edgesRef.current;
        if (!rfNodes.length) break;
        const topoKeyForRun = buildTopoKeyFromElements(rfNodes, rfEdges);
        const requestIdForRun = latestRequestIdRef.current;
        // Match config-graph behavior: still compute a layout even when the
        // container is temporarily 0x0 (e.g. during tab/portal transitions on iPad).
        // This avoids leaving all nodes at (0,0), which visually looks like one node.

        const effectiveDirection = autoDirection
          ? resolveAutoDirection({
              nodes: rfNodes,
              edges: rfEdges,
              containerWidth: effectiveViewportWidth,
              containerHeight: effectiveViewportHeight,
              preferredDirection: direction,
              previousDirection: lastDirectionRef.current,
            })
          : direction;
        lastDirectionRef.current = effectiveDirection;

        const resolveNodeLayoutSize = getNodeLayoutSizeRef.current;
        const manualPathPositions = buildSinglePathLayout(
          rfNodes.map((n) => {
            const { width, height } = resolveNodeLayoutSize(n);
            return { id: String(n.id), width, height };
          }),
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
                  containerWidth: effectiveViewportWidth,
                  containerHeight: effectiveViewportHeight,
                  maxAxisScale,
                })
              : manualPathPositions;
          const isCurrentRun =
            isMountedRef.current &&
            requestIdForRun === latestRequestIdRef.current &&
            topoKeyForRun === buildTopoKeyFromElements(nodesRef.current, edgesRef.current);
          if (isCurrentRun) {
            retryWhenVisibleRef.current = false;
            onLayoutRef.current?.(nextPositions);
            setCompletedLayouts((count) => count + 1);
          }
          // Yield once so synchronous manual layouts still expose a busy state to controls.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        } else {
          if (workerGraphKeyRef.current !== topoKeyForRun) {
            elkRef.current?.terminateWorker();
            elkRef.current = createElkWithWorker(workerName);
            workerGraphKeyRef.current = topoKeyForRun;
          }

          const elk = elkRef.current!;
          // Prepare ELK graph (position-only layout)
          const elkNodes: ElkNode[] = rfNodes.map((n) => ({
            ...resolveNodeLayoutSize(n),
            id: n.id,
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
              // Dynamically swap orientation to better use viewport space.
              'elk.direction': effectiveDirection,
              // Balanced node placement to reduce long sweeps
              'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
            },
            children: elkNodes,
            edges: elkEdges,
          };

          try {
            const res = await runElkLayoutWithTimeout(
              elk,
              elkGraph,
              ELK_LAYOUT_TIMEOUT_MS
            );

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
                    containerWidth: effectiveViewportWidth,
                    containerHeight: effectiveViewportHeight,
                    maxAxisScale,
                  })
                : posById;
            const isCurrentRun =
              isMountedRef.current &&
              requestIdForRun === latestRequestIdRef.current &&
              topoKeyForRun === buildTopoKeyFromElements(nodesRef.current, edgesRef.current);
            if (isCurrentRun) {
              retryWhenVisibleRef.current = false;
              onLayoutRef.current?.(nextPositions);
              setCompletedLayouts((count) => count + 1);
            }
          } catch {
            resetElkWorker();

            if (!isMountedRef.current) break;

            if (isDocumentHidden()) {
              retryWhenVisibleRef.current = true;
              break;
            }

            if (isElementHidden(containerRef?.current)) break;

            const topologyChanged =
              topoKeyForRun !== buildTopoKeyFromElements(nodesRef.current, edgesRef.current);
            const supersededByNewerRun = requestIdForRun !== latestRequestIdRef.current;
            if (topologyChanged || supersededByNewerRun) continue;

            if (lastFailureToastTopoKeyRef.current !== topoKeyForRun) {
              lastFailureToastTopoKeyRef.current = topoKeyForRun;
              toast.warning('Layout failed. Please try again with fewer nodes.');
            }
            // ELK may throw on very deep/wide trees (e.g. self-loop-heavy examples).
            // Fall back to a deterministic layered layout so nodes stay visible.
            try {
              const fallbackPositions = buildFallbackPositions(
                rfNodes,
                rfEdges,
                {
                  nodeSep,
                  rankSep,
                  padding,
                  direction: effectiveDirection,
                },
                resolveNodeLayoutSize
              );
              retryWhenVisibleRef.current = false;
              onLayoutRef.current?.(fallbackPositions);
              setCompletedLayouts((count) => count + 1);
            } catch {
              // Last-resort placement: keep nodes visible in a simple grid.
              const emergencyPositions = new Map<string, { x: number; y: number }>();
              const spacingX = DEFAULT_NODE_SIZE + Math.max(24, nodeSep);
              const spacingY = DEFAULT_NODE_SIZE + Math.max(24, rankSep);
              const columns = 20;
              for (let i = 0; i < rfNodes.length; i++) {
                const n = rfNodes[i]!;
                emergencyPositions.set(String(n.id), {
                  x: padding + (i % columns) * spacingX,
                  y: padding + Math.floor(i / columns) * spacingY,
                });
              }
              retryWhenVisibleRef.current = false;
              onLayoutRef.current?.(emergencyPositions);
              setCompletedLayouts((count) => count + 1);
            }
          }
        }

        if (!rerunRequestedRef.current) break;
      }
    } finally {
      isRunningRef.current = false;
      if (isMountedRef.current) setRunning(false);
    }
  }, [
    algorithm,
    nodeSep,
    rankSep,
    edgeSep,
    edgeNodeSep,
    padding,
    maxAxisScale,
    direction,
    autoDirection,
    scaleToFit,
    effectiveViewportWidth,
    effectiveViewportHeight,
    containerRef,
    workerName,
    resetElkWorker,
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!retryWhenVisibleRef.current) return;
      retryWhenVisibleRef.current = false;
      void runLayout();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [runLayout]);

  // Fit view after layout if requested
  const restart = useCallback(() => {
    lastTopoKeyRef.current = '';
    void runLayout();
  }, [runLayout]);

  // Automatically recalculate when the topology changes
  useEffect(() => {
    if (!autoRun) return;
    if (lastTopoKeyRef.current === topoKey) return;
    lastTopoKeyRef.current = topoKey;
    void runLayout();
  }, [topoKey, runLayout, autoRun]);

  useEffect(() => {
    if (!autoDirection) return;
    if (nodesRef.current.length === 0) return;
    const hasViewportSnapshot =
      typeof viewportWidth === 'number' && typeof viewportHeight === 'number';
    if (hasViewportSnapshot && (viewportWidth <= 0 || viewportHeight <= 0)) return;

    if (!autoResizeLayoutEnabled) {
      lastSizeKeyRef.current = viewportSizeKey;
      return;
    }

    if (lastSizeKeyRef.current === viewportSizeKey) return;
    const hadPreviousSize = lastSizeKeyRef.current !== '';
    lastSizeKeyRef.current = viewportSizeKey;
    if (!hadPreviousSize) return;

    const shouldRunLayout = onAutoResizeLayoutRef.current?.() !== false;
    if (!shouldRunLayout) return;
    void runLayout();
  }, [autoDirection, autoResizeLayoutEnabled, viewportSizeKey, runLayout]);

  return useMemo(
    () => ({ restart, running, completedLayouts }),
    [completedLayouts, restart, running]
  );
}
