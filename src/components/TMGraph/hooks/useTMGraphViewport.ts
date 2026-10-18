import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { Core as CyCore } from 'cytoscape';
import { useElkLayout } from '@components/ComputationTree/layout/useElkLayout';
import { useGraphFrameTask } from '@hooks/useGraphFrameTask';
import { useDebouncedLayoutRestart } from '@hooks/useDebouncedLayoutRestart';
import { useTMGraphELKSettings } from '@zustands/GraphZustand';
import type { TMGraphNode, TMGraphEdge } from '../util/buildTMGraph';

export function useTMGraphViewport({
  cyRef,
  containerRef,
  nodes,
  edges,
  setNodes,
  topoKey,
  expectedNodeKey,
  expectedEdgeKey,
  setContainerVisible,
  refreshSelectedEdgeTooltipAnchor,
}: {
  cyRef: RefObject<CyCore | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  nodes: TMGraphNode[];
  edges: TMGraphEdge[];
  setNodes: Dispatch<SetStateAction<TMGraphNode[]>>;
  topoKey: string;
  expectedNodeKey: string;
  expectedEdgeKey: string;
  setContainerVisible: Dispatch<SetStateAction<boolean>>;
  refreshSelectedEdgeTooltipAnchor: () => void;
}) {
  const tmGraphELKSettings = useTMGraphELKSettings();
  const pendingFitViewRef = useRef(false);
  const pendingFitViewDoneRef = useRef<(() => void) | null>(null);
  const [viewportReady, setViewportReady] = useState(false);
  const layout = useElkLayout({
    nodes,
    edges,
    algorithm: tmGraphELKSettings.algorithm,
    nodeSep: tmGraphELKSettings.nodeSep,
    rankSep: tmGraphELKSettings.rankSep,
    edgeSep: tmGraphELKSettings.edgeSep,
    edgeNodeSep: tmGraphELKSettings.edgeNodeSep,
    padding: tmGraphELKSettings.padding,
    direction: tmGraphELKSettings.direction,
    topoKeyOverride: topoKey,
    autoRun: false,
    onLayout: (positions) => {
      setNodes((prev) => {
        const nextPositions = new Map<string, { x: number; y: number }>();
        const seen = new Set<string>();

        for (const node of prev) {
          const p = positions.get(node.id);
          if (!p) continue;
          nextPositions.set(node.id, p);
          seen.add(`${Math.round(p.x)}:${Math.round(p.y)}`);
        }

        // Fallback spread if ELK returns a collapsed layout.
        if (prev.length > 1 && nextPositions.size > 1 && seen.size <= 1) {
          const center = Array.from(nextPositions.values())[0] ?? { x: 0, y: 0 };
          const radius = Math.max(130, prev.length * 6);
          prev.forEach((node, idx) => {
            const angle = (idx / Math.max(1, prev.length)) * Math.PI * 2;
            nextPositions.set(node.id, {
              x: center.x + Math.cos(angle) * radius,
              y: center.y + Math.sin(angle) * radius,
            });
          });
        }

        return prev.map((node) => {
          const next = nextPositions.get(node.id);
          if (!next) return node;
          const same = node.position.x === next.x && node.position.y === next.y;
          return same ? node : { ...node, position: next };
        });
      });
    },
  });

  const scheduleLayoutRestart = useDebouncedLayoutRestart(layout);
  const viewportTask = useGraphFrameTask([topoKey, layout.running]);

  const isContainerVisible = useCallback(() => {
    const el = containerRef.current;
    return !!el && el.clientWidth > 0 && el.clientHeight > 0;
  }, []);

  const deferFitViewUntilVisible = useCallback((onDone?: () => void) => {
    pendingFitViewRef.current = true;
    if (!onDone) return;

    pendingFitViewDoneRef.current = onDone;
  }, []);

  const runFitView = useCallback(
    (onDone?: () => void) => {
      const cy = cyRef.current;
      if (!cy) return;

      if (!isContainerVisible()) {
        deferFitViewUntilVisible(onDone);
        return;
      }

      viewportTask.schedule(() => {
        if (cy.destroyed()) return;
        if (!isContainerVisible()) {
          deferFitViewUntilVisible(onDone);
          return;
        }

        cy.resize();

        if (cy.elements().length > 0) {
          cy.fit(cy.elements(), 30);
        }

        onDone?.();
      }, 1);
    },
    [deferFitViewUntilVisible, isContainerVisible, viewportTask]
  );

  const flushDeferredFitView = useCallback(() => {
    if (!pendingFitViewRef.current) return;

    const onDone = pendingFitViewDoneRef.current ?? undefined;
    pendingFitViewRef.current = false;
    pendingFitViewDoneRef.current = null;
    runFitView(onDone);
  }, [runFitView]);

  useEffect(() => {
    setContainerVisible(isContainerVisible());
  }, [isContainerVisible]);

  const currentNodeKey = useMemo(
    () =>
      nodes
        .map((n) => n.id)
        .sort((a, b) => a.localeCompare(b))
        .join('|'),
    [nodes]
  );
  const currentEdgeKey = useMemo(
    () =>
      edges
        .map((e) => e.id)
        .sort((a, b) => a.localeCompare(b))
        .join('|'),
    [edges]
  );

  const lastLaidOutTopoKeyRef = useRef<string | null>(null);
  const fitAfterLayoutRef = useRef(false);
  const lastHandledCompletedLayoutsRef = useRef(layout.completedLayouts);
  const structureReadyForLayout =
    nodes.length > 0 &&
    expectedNodeKey.length > 0 &&
    currentNodeKey === expectedNodeKey &&
    currentEdgeKey === expectedEdgeKey;

  useLayoutEffect(() => {
    if (nodes.length === 0) {
      lastLaidOutTopoKeyRef.current = null;
      setViewportReady(true);
      return;
    }
    if (!structureReadyForLayout) {
      setViewportReady(false);
      return;
    }

    if (lastLaidOutTopoKeyRef.current === topoKey) return;

    lastLaidOutTopoKeyRef.current = topoKey;
    setViewportReady(false);
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [nodes.length, topoKey, scheduleLayoutRestart, structureReadyForLayout]);

  useEffect(() => {
    if (
      layout.running ||
      lastHandledCompletedLayoutsRef.current === layout.completedLayouts
    )
      return;
    lastHandledCompletedLayoutsRef.current = layout.completedLayouts;
    if (!fitAfterLayoutRef.current || nodes.length === 0) return;

    fitAfterLayoutRef.current = false;
    runFitView(() => {
      setViewportReady(true);
    });
  }, [layout.running, layout.completedLayouts, nodes.length, runFitView]);

  const observeContainer = useCallback(() => {
    const cy = cyRef.current;
    const el = containerRef.current;
    if (!cy || !el || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(() => {
      const visible = isContainerVisible();
      setContainerVisible(visible);
      cy.resize();

      if (visible) {
        flushDeferredFitView();
        refreshSelectedEdgeTooltipAnchor();
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [flushDeferredFitView, isContainerVisible, refreshSelectedEdgeTooltipAnchor]);

  const recalcLayout = useCallback(() => {
    setViewportReady(false);
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [scheduleLayoutRestart]);

  const zoomBy = useCallback((factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;

    const next = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor));
    cy.zoom({
      level: next,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  }, []);

  const clearPendingFit = useCallback(() => {
    pendingFitViewRef.current = false;
    pendingFitViewDoneRef.current = null;
  }, []);
  return {
    observeContainer,
    viewportReady,
    running: layout.running,
    runFitView,
    recalcLayout,
    zoomBy,
    clearPendingFit,
  };
}
