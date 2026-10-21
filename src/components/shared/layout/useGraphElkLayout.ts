import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ElkLayoutEngine } from './elkWorkerClient';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { toast } from 'sonner';

import {
  createElkWithWorker,
  runElkLayoutWithTimeout,
  type ElkAlgo,
} from './elkUtils';
import { resolveAutoDirection } from './autoDirection';
import { scaleToContainer } from './scaleToContainer';
import { buildSinglePathLayout } from './singlePathLayout';
import {
  buildElkGraph,
  buildRecoveryLayout,
  captureGraphTopologySnapshot,
  getDefaultNodeLayoutSize,
  getGraphTopologyKey,
  readElkPositions,
  type NodeLayoutSizeResolver,
  type Positions,
} from './graphLayout';

export type { NodeLayoutSize, NodeLayoutSizeResolver } from './graphLayout';

const ELK_LAYOUT_TIMEOUT_MS = 12000;

export type Options = {
  algorithm?: ElkAlgo;
  nodeSep?: number;
  rankSep?: number;
  edgeSep?: number;
  edgeNodeSep?: number;
  padding?: number;
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
  restart: () => void;
  running: boolean;
  completedLayouts: number;
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
  onLayout: (positions: Positions) => void;
}): LayoutAPI {
  const [running, setRunning] = useState(false);
  const [completedLayouts, setCompletedLayouts] = useState(0);
  const [observedSize, setObservedSize] = useState({ width: 0, height: 0 });
  const lastViewportRef = useRef({ width: 0, height: 0 });
  const lastDirectionRef = useRef(direction);
  const lastTopoKeyRef = useRef('');
  const lastSizeKeyRef = useRef('');
  const lastFailureToastTopoKeyRef = useRef('');
  const workerRef = useRef<{ elk: ElkLayoutEngine; key: string } | null>(null);
  const activeRunRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);
  const mountedRef = useRef(false);
  const resumeAfterMountRef = useRef(false);
  const retryWhenVisibleRef = useRef(false);

  useEffect(() => {
    const element = containerRef?.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const { clientWidth: width, clientHeight: height } = element;
      if (width <= 0 || height <= 0) return;
      setObservedSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height }
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  // Hidden panels can report 0x0. Keep the last usable viewport for background jobs.
  const width =
    (viewportWidth && viewportWidth > 0 ? viewportWidth : observedSize.width) ||
    lastViewportRef.current.width ||
    (typeof window !== 'undefined' ? window.innerWidth : 1);
  const height =
    (viewportHeight && viewportHeight > 0 ? viewportHeight : observedSize.height) ||
    lastViewportRef.current.height ||
    (typeof window !== 'undefined' ? window.innerHeight : 1);
  const viewportSizeKey = `${Math.max(1, Math.round(width / 80))}x${Math.max(1, Math.round(height / 80))}`;
  const topoKey = useMemo(
    () => topoKeyOverride ?? getGraphTopologyKey(nodes, edges),
    [nodes, edges, topoKeyOverride]
  );
  const input = {
    nodes,
    edges,
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
    getNodeLayoutSize,
    workerName,
    width,
    height,
    onLayout,
    onAutoResizeLayout,
  };
  const inputRef = useRef(input);
  useLayoutEffect(() => {
    inputRef.current = input;
    lastViewportRef.current = { width, height };
  });
  useLayoutEffect(() => {
    lastDirectionRef.current = direction;
  }, [direction]);

  const disposeWorker = useCallback(() => {
    workerRef.current?.elk.terminateWorker();
    workerRef.current = null;
  }, []);

  const restart = useCallback(() => {
    if (!mountedRef.current) return;
    requestVersionRef.current += 1;
    if (activeRunRef.current) return;

    // One drain owns both the worker and its running state. New requests are
    // coalesced; the next iteration always reads the latest committed input.
    const controller = new AbortController();
    activeRunRef.current = controller;
    setRunning(true);
    void (async () => {
      try {
        let version: number;
        do {
          version = requestVersionRef.current;
          const current = inputRef.current;
          if (!current.nodes.length) break;
          const topology = captureGraphTopologySnapshot(
            current.nodes,
            current.edges
          );
          const isCurrent = () =>
            activeRunRef.current === controller &&
            !controller.signal.aborted &&
            version === requestVersionRef.current &&
            topology.matches(inputRef.current.nodes, inputRef.current.edges);
          const effectiveDirection = current.autoDirection
            ? resolveAutoDirection({
                nodes: current.nodes,
                edges: current.edges,
                containerWidth: current.width,
                containerHeight: current.height,
                preferredDirection: current.direction,
                previousDirection: lastDirectionRef.current,
              })
            : current.direction;
          lastDirectionRef.current = effectiveDirection;
          const spacing = { ...current, direction: effectiveDirection };
          let positions = buildSinglePathLayout(
            current.nodes.map((node) => ({
              id: String(node.id),
              ...current.getNodeLayoutSize(node),
            })),
            current.edges.map((edge) => ({
              source: String(edge.source),
              target: String(edge.target),
            })),
            spacing
          );
          const manual = positions !== null;
          let recovered = false;

          if (!positions) {
            try {
              const workerKey = `${current.workerName}:${topology.key}`;
              if (workerRef.current?.key !== workerKey) {
                disposeWorker();
                workerRef.current = {
                  elk: createElkWithWorker(current.workerName, {
                    positionsOnly: true,
                  }),
                  key: workerKey,
                };
              }
              positions = readElkPositions(
                await runElkLayoutWithTimeout(
                  workerRef.current.elk,
                  buildElkGraph(
                    current.nodes,
                    current.edges,
                    current.getNodeLayoutSize,
                    spacing
                  ),
                  ELK_LAYOUT_TIMEOUT_MS,
                  controller.signal
                )
              );
            } catch (error) {
              if (controller.signal.aborted) return;
              disposeWorker();
              if (!isCurrent()) continue;
              if (
                typeof document !== 'undefined' &&
                document.visibilityState === 'hidden'
              ) {
                retryWhenVisibleRef.current = true;
                return;
              }
              if (lastFailureToastTopoKeyRef.current !== topology.key) {
                lastFailureToastTopoKeyRef.current = topology.key;
                console.warn('ELK layout failed', error);
                toast.warning('Layout failed. Please try again with fewer nodes.');
              }
              // A hidden panel still needs its result. Only document suspension
              // defers a retry; switching application tabs never blocks recovery.
              positions = buildRecoveryLayout(
                current.nodes,
                current.edges,
                spacing,
                current.getNodeLayoutSize
              );
              recovered = true;
            }
          }

          if (isCurrent()) {
            const result =
              !recovered && current.autoDirection && current.scaleToFit
                ? scaleToContainer({
                    positions,
                    containerWidth: current.width,
                    containerHeight: current.height,
                    maxAxisScale: current.maxAxisScale,
                  })
                : positions;
            retryWhenVisibleRef.current = false;
            inputRef.current.onLayout(result);
            setCompletedLayouts((count) => count + 1);
          }
          // Preserve an observable busy state even for synchronous path layouts.
          if (manual) await new Promise<void>((resolve) => setTimeout(resolve, 0));
        } while (
          !controller.signal.aborted &&
          version !== requestVersionRef.current
        );
      } finally {
        // A disposed drain must never clear a replacement drain's loading state.
        if (activeRunRef.current === controller) {
          activeRunRef.current = null;
          setRunning(false);
        }
      }
    })();
  }, [disposeWorker]);

  useEffect(() => {
    mountedRef.current = true;
    if (resumeAfterMountRef.current) {
      resumeAfterMountRef.current = false;
      restart();
    }
    return () => {
      mountedRef.current = false;
      resumeAfterMountRef.current = activeRunRef.current !== null;
      activeRunRef.current?.abort();
      activeRunRef.current = null;
      disposeWorker();
    };
  }, [disposeWorker, restart]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !retryWhenVisibleRef.current)
        return;
      retryWhenVisibleRef.current = false;
      restart();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [restart]);

  useEffect(() => {
    if (!autoRun || lastTopoKeyRef.current === topoKey) return;
    lastTopoKeyRef.current = topoKey;
    restart();
  }, [autoRun, topoKey, restart]);

  useEffect(() => {
    if (!autoDirection || !inputRef.current.nodes.length) return;
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
    if (hadPreviousSize && inputRef.current.onAutoResizeLayout?.() !== false)
      restart();
  }, [
    autoDirection,
    autoResizeLayoutEnabled,
    viewportSizeKey,
    viewportWidth,
    viewportHeight,
    restart,
  ]);

  return useMemo(
    () => ({ restart, running, completedLayouts }),
    [restart, running, completedLayouts]
  );
}
