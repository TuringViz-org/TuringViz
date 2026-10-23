import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { Core as CyCore } from 'cytoscape';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  useConfigGraphNodeMode,
  useConfigGraphELKSettings,
  useGraphZustand,
} from '@zustands/GraphZustand';
import {
  ConfigNodeMode,
  DEFAULT_GRAPH_CARDS_ELK_OPTS,
  DEFAULT_GRAPH_ELK_OPTS,
  DEFAULT_GRAPH_NODES_ELK_OPTS,
} from '@utils/constants';
import {
  ensureStartNodeVisible,
  type CytoscapeViewport,
} from '@components/shared/cytoscapeViewport';
import { useGraphLayoutRequest } from '@hooks/useGraphLayoutRequest';
import { useGraphFrameTask } from '@hooks/useGraphFrameTask';
import { useDebouncedLayoutRestart } from '@hooks/useDebouncedLayoutRestart';
import {
  PORTAL_BRIDGE_SWITCH_EVENT,
  type PortalBridgeSwitchDetail,
} from '@components/MainPage/PortalBridge';
import { useElkLayout } from '../layout/useElkLayout';
import type { useConfigGraphCircleData } from './useConfigGraphCircleData';

const NODES_MIN_FIT_ZOOM = 0.02;
export function useConfigGraphCircleViewport({
  data,
  active,
  cyRef,
  containerRef,
  setContainerVisible,
  refreshSelectedAnchors,
}: {
  data: ReturnType<typeof useConfigGraphCircleData>;
  active: boolean;
  cyRef: RefObject<CyCore | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  setContainerVisible: (visible: boolean) => void;
  refreshSelectedAnchors: () => void;
}) {
  const {
    nodes,
    edges,
    setNodes,
    baseTopologyKey,
    structureKey,
    structureSyncPending,
  } = data;
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);
  const configGraphComputing = useGlobalZustand((s) => s.configGraphComputing);
  const configGraphNodeMode = useConfigGraphNodeMode();
  const configGraphELKSettings = useConfigGraphELKSettings();
  const setConfigGraphELKSettings = useGraphZustand(
    (s) => s.setConfigGraphELKSettings
  );
  const viewportRef = useRef<CytoscapeViewport | null>(null);
  const [viewportReady, setViewportReady] = useState(false);
  const [readyTopologyKey, setReadyTopologyKey] = useState('');
  const layoutRequestRevisionRef = useRef(0);
  const startedLayoutRevisionRef = useRef(0);
  const [positionedStructure, setPositionedStructure] = useState({
    key: structureKey,
    positioned: false,
    layoutRevision: layoutRequestRevisionRef.current,
  });
  // Reset on each structural revision, including A → B → A. A previously
  // positioned key alone cannot prove that the current nodes have positions.
  if (positionedStructure.key !== structureKey) {
    setPositionedStructure({
      key: structureKey,
      positioned: false,
      layoutRevision: layoutRequestRevisionRef.current,
    });
  }
  const maySyncElements =
    !structureSyncPending &&
    positionedStructure.key === structureKey &&
    positionedStructure.positioned &&
    positionedStructure.layoutRevision === layoutRequestRevisionRef.current;
  const maySyncElementsRef = useRef(maySyncElements);
  useLayoutEffect(() => {
    maySyncElementsRef.current = maySyncElements;
  }, [maySyncElements]);
  const [autoResizeLayoutEnabled, setAutoResizeLayoutEnabled] = useState(true);
  const fitAfterLayoutRef = useRef(false);
  const pendingMachineLoadFitRef = useRef(false);
  const awaitingInitialRevealRef = useRef(false);
  const pendingRevealFitRef = useRef(false);
  const skipNextAutoResizeFitRef = useRef(false);
  const lastHandledMachineLoadRef = useRef<number>(-1);
  const handleAutoResizeLayout = useCallback(() => {
    if (skipNextAutoResizeFitRef.current) {
      skipNextAutoResizeFitRef.current = false;
      return false;
    }
    layoutRequestRevisionRef.current += 1;
    // useElkLayout starts this resize request immediately after this callback.
    startedLayoutRevisionRef.current = layoutRequestRevisionRef.current;
    fitAfterLayoutRef.current = true;
    return true;
  }, []);

  const currentTopologyKeyRef = useRef(baseTopologyKey);

  useEffect(() => {
    currentTopologyKeyRef.current = baseTopologyKey;
  }, [baseTopologyKey]);

  const revealViewport = useCallback(() => {
    awaitingInitialRevealRef.current = false;
    setReadyTopologyKey(currentTopologyKeyRef.current);
    setViewportReady(true);
  }, []);

  const completeLayoutFit = useCallback(() => {
    // A resize can replace the queued fit with another layout. Keep its intent
    // until the current fit actually runs, including while the tab is hidden.
    fitAfterLayoutRef.current = false;
    pendingMachineLoadFitRef.current = false;
    pendingRevealFitRef.current = false;
    if (awaitingInitialRevealRef.current) revealViewport();
  }, [revealViewport]);

  // ELK Layout
  const layout = useElkLayout({
    nodes,
    edges,
    algorithm: 'layered',
    nodeSep: configGraphELKSettings.nodeSep,
    rankSep: configGraphELKSettings.rankSep,
    edgeSep: configGraphELKSettings.edgeSep,
    edgeNodeSep: configGraphELKSettings.edgeNodeSep,
    padding: configGraphELKSettings.padding,
    direction: configGraphELKSettings.direction,
    autoDirection: configGraphELKSettings.autoDirection ?? true,
    scaleToFit: true,
    maxAxisScale: configGraphNodeMode === ConfigNodeMode.CARDS ? undefined : 1.45,
    containerRef,
    topoKeyOverride: structureKey,
    autoRun: false,
    autoResizeLayoutEnabled: active && autoResizeLayoutEnabled,
    onAutoResizeLayout: handleAutoResizeLayout,
    onLayout: (positions) => {
      // A newer debounced request may still be waiting for its first frame.
      if (startedLayoutRevisionRef.current !== layoutRequestRevisionRef.current)
        return;
      setNodes((prev) =>
        prev.map((n) => {
          const p = positions.get(n.id);
          if (!p) return n;
          const same = n.position?.x === p.x && n.position?.y === p.y;
          return same ? n : { ...n, position: p };
        })
      );
      setPositionedStructure({
        key: structureKey,
        positioned: true,
        layoutRevision: startedLayoutRevisionRef.current,
      });
    },
  });
  const startLayout = useCallback(() => {
    // An immediate resize can already have started the latest queued request.
    if (startedLayoutRevisionRef.current === layoutRequestRevisionRef.current)
      return;
    startedLayoutRevisionRef.current = layoutRequestRevisionRef.current;
    layout.restart();
  }, [layout.restart]);
  const scheduleRestart = useDebouncedLayoutRestart({ restart: startLayout });
  const scheduleLayoutRestart = useCallback(() => {
    layoutRequestRevisionRef.current += 1;
    scheduleRestart();
  }, [scheduleRestart]);
  const viewportTask = useGraphFrameTask([
    machineLoadVersion,
    baseTopologyKey,
    layout.running,
  ]);
  const portalTask = useGraphFrameTask([machineLoadVersion]);

  useEffect(() => {
    const target =
      configGraphNodeMode === ConfigNodeMode.CARDS
        ? DEFAULT_GRAPH_CARDS_ELK_OPTS
        : DEFAULT_GRAPH_NODES_ELK_OPTS;
    const same =
      configGraphELKSettings.nodeSep === target.nodeSep &&
      configGraphELKSettings.rankSep === target.rankSep &&
      configGraphELKSettings.edgeSep === target.edgeSep &&
      configGraphELKSettings.edgeNodeSep === target.edgeNodeSep &&
      configGraphELKSettings.padding === target.padding;
    if (same) return;
    setConfigGraphELKSettings({
      nodeSep: target.nodeSep,
      rankSep: target.rankSep,
      edgeSep: target.edgeSep,
      edgeNodeSep: target.edgeNodeSep,
      padding: target.padding,
    });
  }, [configGraphNodeMode, configGraphELKSettings, setConfigGraphELKSettings]);

  const completedLayoutsRef = useRef(layout.completedLayouts);
  useEffect(() => {
    if (nodes.length === 0) setViewportReady(false);
  }, [nodes.length]);
  useEffect(() => {
    if (!configGraphComputing) {
      if (
        awaitingInitialRevealRef.current &&
        !layout.running &&
        maySyncElements &&
        !fitAfterLayoutRef.current &&
        baseTopologyKey === structureKey &&
        readyTopologyKey === baseTopologyKey
      ) {
        revealViewport();
      }
      return;
    }
    awaitingInitialRevealRef.current = true;
    setViewportReady(false);
  }, [
    configGraphComputing,
    layout.running,
    maySyncElements,
    baseTopologyKey,
    structureKey,
    readyTopologyKey,
    revealViewport,
  ]);

  useEffect(() => {
    if (structureSyncPending) {
      awaitingInitialRevealRef.current = true;
      setViewportReady(false);
    }
  }, [structureSyncPending, baseTopologyKey]);

  // Topology key
  const topoKey = structureKey;
  const showLoadingOverlay =
    !viewportReady ||
    !maySyncElements ||
    readyTopologyKey !== baseTopologyKey ||
    layout.running ||
    configGraphComputing ||
    structureSyncPending;

  useGraphLayoutRequest(
    [machineLoadVersion, configGraphNodeMode, topoKey, nodes.length],
    nodes.length > 0 && !structureSyncPending,
    () => {
      awaitingInitialRevealRef.current = true;
      setViewportReady(false);
      fitAfterLayoutRef.current = true;
    },
    scheduleLayoutRestart
  );

  const fitViewNow = useCallback(
    (focusId?: string, onDone?: () => void) => {
      const cy = cyRef.current;
      if (!cy || cy.destroyed()) return;
      const element = containerRef.current;
      if (
        !maySyncElementsRef.current ||
        !element ||
        element.clientWidth <= 0 ||
        element.clientHeight <= 0
      ) {
        pendingRevealFitRef.current = true;
        return;
      }
      cy.resize();
      if (focusId) {
        const ele = cy.getElementById(focusId);
        if (ele && ele.length > 0) {
          cy.fit(ele, 60);
          onDone?.();
          return;
        }
      }
      cy.fit(cy.elements(), 30);
      if (cy.zoom() < NODES_MIN_FIT_ZOOM) {
        cy.zoom({
          level: NODES_MIN_FIT_ZOOM,
          renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
        });
      }
      ensureStartNodeVisible(cy);
      onDone?.();
    },
    [cyRef, containerRef]
  );

  // Manual fits and visibility changes retain their frame scheduling.
  const runFitView = useCallback(
    (focusId?: string, onDone?: () => void) => {
      viewportTask.schedule(() => fitViewNow(focusId, onDone), 1);
    },
    [viewportTask, fitViewNow]
  );

  const isContainerVisible = useCallback(() => {
    const el = containerRef.current;
    return !!el && el.clientWidth > 0 && el.clientHeight > 0;
  }, []);

  useEffect(() => {
    setContainerVisible(isContainerVisible());
  }, [isContainerVisible]);

  // Re-center on every successful "Load Machine".
  useEffect(() => {
    if (lastHandledMachineLoadRef.current === machineLoadVersion) return;
    pendingMachineLoadFitRef.current = !isContainerVisible();
    awaitingInitialRevealRef.current = true;
    setViewportReady(false);
    if (nodes.length === 0) return;
    lastHandledMachineLoadRef.current = machineLoadVersion;
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [machineLoadVersion, nodes.length, isContainerVisible]);

  const restoreViewport = useCallback(() => {
    const cy = cyRef.current;
    const viewport = viewportRef.current;
    if (!cy || !viewport) return;
    cy.viewport(viewport);
  }, []);

  // Called after the component has synchronized elements and interaction
  // classes. Cytoscape computes current bounds synchronously during fit, so its
  // next renderer frame can draw the completed graph at the final viewport.
  const onElementsSynced = useCallback(() => {
    const justFinished =
      !layout.running && completedLayoutsRef.current !== layout.completedLayouts;
    // A resize or queued restart can be requested earlier in this effect flush
    // while this callback still sees the previous running state. Only committed
    // positions from the current request may consume its fit intent.
    if (
      maySyncElements &&
      cyRef.current &&
      justFinished &&
      positionedStructure.layoutRevision === layoutRequestRevisionRef.current
    ) {
      completedLayoutsRef.current = layout.completedLayouts;
      if (fitAfterLayoutRef.current && nodes.length > 0) {
        const visibleNow = isContainerVisible();
        if (visibleNow) {
          viewportTask.cancel();
          fitViewNow(undefined, completeLayoutFit);
        } else {
          // Layout finished while tab is hidden — defer reveal until visible
          pendingRevealFitRef.current = true;
        }
      }
    }
  }, [
    layout.running,
    layout.completedLayouts,
    maySyncElements,
    positionedStructure.layoutRevision,
    cyRef,
    nodes.length,
    viewportTask,
    fitViewNow,
    isContainerVisible,
    completeLayoutFit,
  ]);

  // Event helpers
  // Resize observer
  const observeContainer = useCallback(() => {
    const cy = cyRef.current;
    const el = containerRef.current;
    if (!cy || !el || typeof ResizeObserver === 'undefined') return;
    let wasVisible = isContainerVisible();
    const ro = new ResizeObserver(() => {
      const visibleNow = isContainerVisible();
      const justBecameVisible = !wasVisible && visibleNow;
      wasVisible = visibleNow;
      setContainerVisible(visibleNow);
      cy.resize();
      // A deferred fit stays pending until the visible, completed layout is fitted.
      if (
        (pendingMachineLoadFitRef.current || pendingRevealFitRef.current) &&
        visibleNow &&
        nodes.length > 0 &&
        !layout.running
      ) {
        runFitView(undefined, () => {
          completeLayoutFit();
          refreshSelectedAnchors();
        });
        return;
      }
      // If visibility returns before the initial viewport is ready and no fit
      // is waiting above, request layout and fit again using the visible size.
      if (
        justBecameVisible &&
        !viewportReady &&
        !layout.running &&
        nodes.length > 0
      ) {
        awaitingInitialRevealRef.current = true;
        fitAfterLayoutRef.current = true;
        scheduleLayoutRestart();
        return;
      }
      restoreViewport();
      refreshSelectedAnchors();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    restoreViewport,
    runFitView,
    nodes.length,
    isContainerVisible,
    refreshSelectedAnchors,
    viewportReady,
    layout.running,
    scheduleLayoutRestart,
    completeLayoutFit,
  ]);

  // Portal switch fit
  const scheduleFitAfterSwitch = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    portalTask.schedule(() => {
      if (cy.destroyed()) return;
      cy.resize();
      setContainerVisible(isContainerVisible());
      restoreViewport();
      refreshSelectedAnchors();
    }, 1);
  }, [portalTask, restoreViewport, isContainerVisible, refreshSelectedAnchors]);

  useEffect(() => {
    const handler: EventListener = (event) => {
      const detail = (event as CustomEvent<PortalBridgeSwitchDetail>).detail;
      if (!detail || detail.id !== 'configGraph') return;
      // Preserve the current viewport when moving between regular and fullscreen
      // containers. iPad can emit resize/layout events immediately after switch,
      // which would otherwise trigger an auto-fit and reset pan/zoom.
      skipNextAutoResizeFitRef.current = true;
      setAutoResizeLayoutEnabled(detail.location !== 'target');
      scheduleFitAfterSwitch();
    };
    window.addEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    return () => {
      window.removeEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    };
  }, [scheduleFitAfterSwitch]);

  const recalcLayout = useCallback(() => {
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [scheduleLayoutRestart]);

  const resetLayoutSettings = useCallback(() => {
    setConfigGraphELKSettings({
      ...(configGraphNodeMode === ConfigNodeMode.CARDS
        ? DEFAULT_GRAPH_CARDS_ELK_OPTS
        : DEFAULT_GRAPH_ELK_OPTS),
    });
  }, [configGraphNodeMode, setConfigGraphELKSettings]);

  const saveViewport = useCallback(() => {
    const cy = cyRef.current;
    if (cy) viewportRef.current = { zoom: cy.zoom(), pan: { ...cy.pan() } };
  }, [cyRef]);
  return {
    observeContainer,
    onElementsSynced,
    maySyncElements,
    showLoadingOverlay,
    configGraphComputing,
    running: layout.running,
    runFitView,
    resetLayoutSettings,
    recalcLayout,
    saveViewport,
  };
}
