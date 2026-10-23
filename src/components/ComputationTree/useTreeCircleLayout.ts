import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Core as CyCore } from 'cytoscape';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { ConfigNodeMode } from '@utils/constants';
import { useDebouncedLayoutRestart } from '@hooks/useDebouncedLayoutRestart';
import { useGraphLayoutRequest } from '@hooks/useGraphLayoutRequest';
import { useGraphFrameTask } from '@hooks/useGraphFrameTask';
import { useElkLayout } from './layout/useElkLayout';
import { useTreeSettings, useTreeStructure } from './useTreePresentation';
import type { ViewProps } from './types';

import {
  ensureStartNodeVisible,
  type CytoscapeViewport,
} from '@components/shared/cytoscapeViewport';
const NODES_MIN_FIT_ZOOM = 0.02;
export type RendererRefs = {
  cyRef: RefObject<CyCore | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<CytoscapeViewport | null>;
};

/** Layout completion is revealed only after positions are applied and fitted. */
export function useTreeCircleLayout({
  cyRef,
  containerRef,
  viewportRef,
  treeData,
  paused,
  active,
}: RendererRefs &
  Pick<ViewProps, 'treeData'> & { paused: boolean; active: boolean }) {
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);

  const { nodeMode: computationTreeNodeMode, settings: computationTreeELKSettings } =
    useTreeSettings();

  const { base, isComputing } = treeData;

  const [containerVisible, setContainerVisible] = useState(true);
  const [viewportReady, setViewportReady] = useState(false);
  const [readyTopologyKey, setReadyTopologyKey] = useState('');
  const awaitingInitialRevealRef = useRef(false);
  const invalidateViewport = useCallback(() => {
    awaitingInitialRevealRef.current = true;
    setViewportReady(false);
  }, []);
  const {
    nodes,
    edges,
    structureKey,
    nodeCount,
    structureSyncPending,
    applyPositions,
  } = useTreeStructure(treeData, invalidateViewport);
  const [autoResizeLayoutEnabled, setAutoResizeLayoutEnabled] = useState(true);
  const fitAfterLayoutRef = useRef(false);
  const skipNextAutoResizeFitRef = useRef(false);
  const pendingLayoutViewportFitRef = useRef(false);
  const layoutPositionsAppliedRef = useRef(false);
  const pendingRevealFitRef = useRef(false);
  const handleAutoResizeLayout = useCallback(() => {
    if (nodes.length === 0) return false;
    if (skipNextAutoResizeFitRef.current) {
      skipNextAutoResizeFitRef.current = false;
      return false;
    }
    fitAfterLayoutRef.current = true;
    return true;
  }, [nodes.length]);

  // ELK Layout Hook (sole positioning engine)
  const layout = useElkLayout({
    nodes,
    edges,
    algorithm: computationTreeELKSettings.algorithm,
    nodeSep: computationTreeELKSettings.nodeSep,
    rankSep: computationTreeELKSettings.rankSep,
    edgeSep: computationTreeELKSettings.edgeSep,
    edgeNodeSep: computationTreeELKSettings.edgeNodeSep,
    padding: computationTreeELKSettings.padding,
    direction: computationTreeELKSettings.direction,
    autoDirection: computationTreeELKSettings.autoDirection ?? true,
    scaleToFit: true,
    maxAxisScale:
      computationTreeNodeMode === ConfigNodeMode.CARDS ? undefined : 1.45,
    containerRef,
    topoKeyOverride: structureKey,
    autoRun: false,
    autoResizeLayoutEnabled: active && !paused && autoResizeLayoutEnabled,
    onAutoResizeLayout: handleAutoResizeLayout,
    onLayout: (positions) => {
      if (fitAfterLayoutRef.current) {
        pendingLayoutViewportFitRef.current = true;
        layoutPositionsAppliedRef.current = false;
      }
      applyPositions(positions);
    },
  });
  const scheduleLayoutRestart = useDebouncedLayoutRestart(layout);
  const { schedule: scheduleViewportTask } = useGraphFrameTask([
    base.topoKey,
    layout.running,
  ]);

  // Performance + layout tracking
  const handledLayoutCompletionRef = useRef(layout.completedLayouts);
  const pendingMachineLoadFitRef = useRef(false);
  const currentTopologyKeyRef = useRef(base.topoKey);

  useEffect(() => {
    currentTopologyKeyRef.current = base.topoKey;
  }, [base.topoKey]);

  const revealViewport = useCallback(() => {
    awaitingInitialRevealRef.current = false;
    setReadyTopologyKey(currentTopologyKeyRef.current);
    setViewportReady(true);
  }, []);
  useEffect(() => {
    if (nodes.length === 0) setViewportReady(false);
  }, [nodes.length]);

  const runFitView = useCallback(
    (onDone?: () => void) => {
      const cy = cyRef.current;
      if (!cy) return;

      scheduleViewportTask(() => {
        if (cyRef.current !== cy || cy.destroyed()) return;
        if (
          !containerRef.current?.clientWidth ||
          !containerRef.current?.clientHeight
        ) {
          pendingRevealFitRef.current = true;
          return;
        }
        cy.resize();
        cy.fit(cy.elements(), 30);
        if (cy.zoom() < NODES_MIN_FIT_ZOOM) {
          cy.zoom({
            level: NODES_MIN_FIT_ZOOM,
            renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
          });
        }
        ensureStartNodeVisible(cy);
        viewportRef.current = {
          zoom: cy.zoom(),
          pan: { ...cy.pan() },
        };
        onDone?.();
      }, 1);
    },
    [scheduleViewportTask]
  );

  const isContainerVisible = useCallback(() => {
    const el = containerRef.current;
    return !!el && el.clientWidth > 0 && el.clientHeight > 0;
  }, []);

  useEffect(() => {
    setContainerVisible(isContainerVisible());
  }, [isContainerVisible]);

  const prepareLayout = useCallback(() => {
    pendingMachineLoadFitRef.current = !isContainerVisible();
    invalidateViewport();
    fitAfterLayoutRef.current = true;
  }, [invalidateViewport, isContainerVisible]);
  useGraphLayoutRequest(
    [structureKey, computationTreeNodeMode, machineLoadVersion],
    !paused && nodes.length > 0,
    prepareLayout,
    scheduleLayoutRestart
  );

  const restoreViewport = useCallback(() => {
    const cy = cyRef.current;
    const viewport = viewportRef.current;
    if (!cy || !viewport) return;
    cy.viewport(viewport);
  }, []);

  const completePendingLayoutFit = useCallback(() => {
    if (!pendingLayoutViewportFitRef.current) return;
    if (!layoutPositionsAppliedRef.current) return;
    if (layout.running) return;

    pendingLayoutViewportFitRef.current = false;
    layoutPositionsAppliedRef.current = false;
    const visibleNow = isContainerVisible();
    if (visibleNow) {
      runFitView(() => {
        pendingMachineLoadFitRef.current = false;
        if (awaitingInitialRevealRef.current) {
          revealViewport();
        }
      });
    } else {
      // Layout finished while tab is hidden — defer reveal until visible
      pendingRevealFitRef.current = true;
    }
  }, [layout.running, runFitView, isContainerVisible, revealViewport]);

  useEffect(() => {
    if (
      layout.running ||
      handledLayoutCompletionRef.current === layout.completedLayouts
    )
      return;
    handledLayoutCompletionRef.current = layout.completedLayouts;
    if (fitAfterLayoutRef.current && nodes.length > 0) {
      fitAfterLayoutRef.current = false;
      completePendingLayoutFit();
    }
  }, [
    layout.running,
    layout.completedLayouts,
    nodes.length,
    completePendingLayoutFit,
  ]);

  const onPositionsApplied = useCallback(() => {
    if (!pendingLayoutViewportFitRef.current) return;
    layoutPositionsAppliedRef.current = true;
    completePendingLayoutFit();
  }, [completePendingLayoutFit]);

  const loadingMaskVisible =
    !viewportReady ||
    readyTopologyKey !== base.topoKey ||
    layout.running ||
    isComputing ||
    structureSyncPending;

  const recalcLayout = useCallback(() => {
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [scheduleLayoutRestart]);

  return {
    nodes,
    edges,
    nodeCount,
    computationTreeNodeMode,
    containerVisible,
    loadingMaskVisible,
    isComputing,
    runFitView,
    recalcLayout,
    onPositionsApplied,
    observation: {
      base,
      nodes,
      layout,
      viewportReady,
      setContainerVisible,
      setAutoResizeLayoutEnabled,
      isContainerVisible,
      pendingMachineLoadFitRef,
      awaitingInitialRevealRef,
      pendingRevealFitRef,
      fitAfterLayoutRef,
      pendingLayoutViewportFitRef,
      skipNextAutoResizeFitRef,
      runFitView,
      revealViewport,
      restoreViewport,
      scheduleLayoutRestart,
    },
  };
}
