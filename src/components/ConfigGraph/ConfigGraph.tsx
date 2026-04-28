// src/components/ConfigGraph/ConfigGraph.tsx
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useNodesInitialized,
  useStore,
  MarkerType,
  Background,
  type Node as RFNode,
  type Edge as RFEdge,
  type ReactFlowState,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Box,
  Button,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Adjust,
  ViewAgenda,
  Tune,
  CenterFocusStrong,
} from '@mui/icons-material';
import { alpha, useTheme } from '@mui/material/styles';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';

// Components
import { ConfigNode } from './nodes/ConfigNode';
import { ConfigCardNode } from './nodes/ConfigCardNode';
import { FloatingEdge } from './edges/FloatingEdge';
import { LoopEdge } from './edges/LoopEdge';
import { LegendPanel } from '@components/shared/LegendPanel';

import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  useConfigGraphNodeMode,
  useConfigGraphELKSettings,
  useGraphZustand,
} from '@zustands/GraphZustand';
import {
  NodeType,
  EdgeType,
  CONTROL_HEIGHT,
  CARDS_LIMIT,
  COLOR_STATE_SWITCH,
} from './util/constants';
import { useElkLayout } from './layout/useElkLayout';
import { buildConfigGraph } from './util/buildConfigGraph';
import {
  CARDS_CONFIRM_THRESHOLD,
  ConfigNodeMode,
  DEFAULT_GRAPH_CARDS_ELK_OPTS,
  DEFAULT_GRAPH_ELK_OPTS,
  DEFAULT_GRAPH_NODES_ELK_OPTS,
} from '@utils/constants';
import { LayoutSettingsPanel } from './layout/LayoutSettingsPanel';
import { reconcileNodes, reconcileEdges } from '@utils/reactflow';
import { useDeveloperControls } from '@hooks/useDeveloperControls';
import { GraphUIProvider, useGraphUI } from '@components/shared/GraphUIContext';
import {
  PORTAL_BRIDGE_BEFORE_SWITCH_EVENT,
  PORTAL_BRIDGE_SWITCH_EVENT,
  type PortalBridgeSwitchDetail,
} from '@components/MainPage/PortalBridge';
import { ConfigGraphCircles } from './ConfigGraphCircles';
import { LoadingOverlay } from '@components/shared/LoadingOverlay';

const acceptingStates = ['accept', 'accepted', 'done'];
const rejectingStates = ['reject', 'rejected', 'error'];

const normalizeColor = (color?: string) => {
  if (!color) return undefined;
  const m = /^#([0-9a-fA-F]{8})$/.exec(color);
  if (m) {
    const hex = m[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = parseInt(hex.slice(6, 8), 16) / 255;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return color;
};

const resolveStateColor = (
  stateName: string | undefined,
  mapping: Map<string, string>
) => {
  const key = (stateName ?? '').trim();
  if (!key) return undefined;
  const direct = mapping.get(key) ?? mapping.get(String(key));
  if (direct) return direct;
  const lower = key.toLowerCase();
  if (acceptingStates.includes(lower)) return 'accept';
  if (rejectingStates.includes(lower)) return 'reject';
  return undefined;
};

const nodeTypes = {
  [NodeType.CONFIG]: ConfigNode,
  [NodeType.CONFIG_CARD]: ConfigCardNode,
};
const edgeTypes = {
  [EdgeType.FLOATING]: FloatingEdge,
  [EdgeType.LOOP]: LoopEdge,
};

const defaultEdgeOptions = {
  type: EdgeType.FLOATING,
  markerEnd: {
    type: MarkerType.ArrowClosed,
  },
};

// --- Component (React Flow / cards) ---
function ConfigGraphCards() {
  const theme = useTheme();
  // Global Zustand states
  const configGraph = useGlobalZustand((s) => s.configGraph);
  const transitions = useGlobalZustand((s) => s.transitions);
  const stateColorMatching = useGlobalZustand((s) => s.stateColorMatching);
  const configGraphVersion = useGlobalZustand((s) => s.configGraphVersion);
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);
  const configGraphComputing = useGlobalZustand((s) => s.configGraphComputing);

  // Graph Zustand state and setters
  const configGraphNodeMode = useConfigGraphNodeMode();
  const setConfigGraphNodeMode = useGraphZustand((s) => s.setConfigGraphNodeMode);
  const configGraphELKSettings = useConfigGraphELKSettings();
  const setConfigGraphELKSettings = useGraphZustand(
    (s) => s.setConfigGraphELKSettings
  );
  const resolveColorForState = useCallback(
    (stateName?: string) => {
      const res = resolveStateColor(stateName, stateColorMatching);
      if (res === 'accept') return normalizeColor(theme.palette.success.light);
      if (res === 'reject') return normalizeColor(theme.palette.error.light);
      return normalizeColor(res);
    },
    [stateColorMatching, theme.palette.error.light, theme.palette.success.light]
  );

  const rf = useReactFlow();

  // Base graph structure (nodes/edges) extraction
  // ELK will overwrite positions
  const base = useMemo(() => {
    if (!configGraph) return { nodes: [], edges: [], topoKey: '' };
    return buildConfigGraph(configGraph, transitions, undefined, configGraphNodeMode);
  }, [configGraph, transitions, configGraphNodeMode, configGraphVersion]);

  const [nodes, setNodes, onNodesChangeRF] = useNodesState(base.nodes);
  const [edges, setEdges, onEdgesChangeRF] = useEdgesState(base.edges);
  const [structureKey, setStructureKey] = useState('');
  const [autoResizeLayoutEnabled, setAutoResizeLayoutEnabled] = useState(true);

  const { hoveredState, setHoveredState, selected, setSelected } = useGraphUI();

  // ELK Layout Hook (sole positioning engine)
  const layout = useElkLayout({
    algorithm: configGraphELKSettings.algorithm,
    nodeSep: configGraphELKSettings.nodeSep,
    rankSep: configGraphELKSettings.rankSep,
    edgeSep: configGraphELKSettings.edgeSep,
    edgeNodeSep: configGraphELKSettings.edgeNodeSep,
    padding: configGraphELKSettings.padding,
    direction: configGraphELKSettings.direction,
    autoDirection: configGraphELKSettings.autoDirection ?? true,
    scaleToFit: true,
    maxAxisScale: configGraphNodeMode === ConfigNodeMode.CARDS ? undefined : 1.45,
    autoResizeLayoutEnabled,
  });

  // Apply mode-specific layout defaults when node mode changes
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

  // Performance measurement
  const nodesCountRef = useRef(0);

  const nodesReady = useNodesInitialized();
  const didInitialLayoutRef = useRef(false); // Track initial ELK run
  const lastTopoKeyRef = useRef<string | null>(null); // Structural change detection
  const fitAfterLayoutRef = useRef(false); // Request fit after ELK run
  const showDeveloperControls = useDeveloperControls();
  const layoutRunningRef = useRef(layout.running);
  const nodesReadyRef = useRef(nodesReady);
  const prevRunningRef = useRef(layout.running); // Detect running -> idle
  const manualFitPendingRef = useRef(false);
  const awaitingInitialRevealRef = useRef(false);
  const lastHandledMachineLoadRef = useRef<number>(-1);
  const [viewportReady, setViewportReady] = useState(false);
  const pendingReFitRef = useRef(false);
  const viewportWidth = useStore((s: ReactFlowState) => s.width);
  const viewportHeight = useStore((s: ReactFlowState) => s.height);
  const viewportRef = useRef<Viewport | null>(null);
  const viewportVisibleRef = useRef(false);
  const [contentVisible, setContentVisible] = useState(false);
  const revealRaf1Ref = useRef<number | null>(null);
  const revealRaf2Ref = useRef<number | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    nodesCountRef.current = nodes.length;
  }, [nodes.length]);
  useEffect(() => {
    layoutRunningRef.current = layout.running;
  }, [layout.running]);
  useEffect(() => {
    nodesReadyRef.current = nodesReady;
  }, [nodesReady]);
  useEffect(() => {
    if (nodes.length === 0) setViewportReady(false);
  }, [nodes.length]);
  useEffect(() => {
    if (!configGraphComputing) return;
    awaitingInitialRevealRef.current = true;
    setViewportReady(false);
  }, [configGraphComputing]);

  // Sync builder output into RF state; keep previous size/data; ELK will set positions afterwards
  useEffect(() => {
    const nodeCount = base.nodes.length;
    // If too many nodes, hide labels and only show colors
    const hideLabels = nodeCount >= COLOR_STATE_SWITCH;

    setNodes((prev) =>
      reconcileNodes(prev, base.nodes, (n) => {
        const stateName = (n.data as any)?.config?.state;
        const mappedColor = resolveColorForState(stateName);

        return {
          ...(n.data as any),
          showLabel: !hideLabels,
          stateColor: mappedColor,
        };
      })
    );

    setEdges((prev) => reconcileEdges(prev, base.edges));
    setStructureKey((prev) => (prev === base.topoKey ? prev : base.topoKey));
  }, [
    base.nodes,
    base.edges,
    base.topoKey,
    stateColorMatching,
    resolveColorForState,
  ]);

  // Initial/structural layout + fit handling (ELK)
  // Compute structural topology key locally (IDs + unique source→target pairs)
  const topoKey = structureKey;
  const structureSyncPending = base.topoKey !== structureKey;
  const showLoadingOverlay =
    !viewportReady || layout.running || configGraphComputing || structureSyncPending;
  const loadingMaskVisible = showLoadingOverlay || !contentVisible;

  useEffect(() => {
    const clearRevealQueue = () => {
      if (revealRaf1Ref.current != null) {
        window.cancelAnimationFrame(revealRaf1Ref.current);
        revealRaf1Ref.current = null;
      }
      if (revealRaf2Ref.current != null) {
        window.cancelAnimationFrame(revealRaf2Ref.current);
        revealRaf2Ref.current = null;
      }
      if (revealTimeoutRef.current != null) {
        window.clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
    };
    clearRevealQueue();

    if (showLoadingOverlay) {
      setContentVisible(false);
      return clearRevealQueue;
    }

    revealRaf1Ref.current = window.requestAnimationFrame(() => {
      revealRaf1Ref.current = null;
      revealRaf2Ref.current = window.requestAnimationFrame(() => {
        revealRaf2Ref.current = null;
        revealTimeoutRef.current = window.setTimeout(() => {
          revealTimeoutRef.current = null;
          setContentVisible(true);
        }, 90);
      });
    });
    return clearRevealQueue;
  }, [showLoadingOverlay]);

  // Start ELK once when nodes are ready
  useEffect(() => {
    if (!didInitialLayoutRef.current && nodesReady && nodes.length > 0) {
      didInitialLayoutRef.current = true;
      awaitingInitialRevealRef.current = true;
      setViewportReady(false);
      layout.restart();
      fitAfterLayoutRef.current = true;
    }
  }, [nodesReady, nodes.length, layout]);

  // Start ELK on structural changes
  useEffect(() => {
    if (!nodesReady || nodes.length === 0) return;
    if (lastTopoKeyRef.current === null) {
      lastTopoKeyRef.current = topoKey;
      return;
    }
    if (lastTopoKeyRef.current === topoKey) return;
    lastTopoKeyRef.current = topoKey;

    awaitingInitialRevealRef.current = true;
    setViewportReady(false);
    layout.restart();
    fitAfterLayoutRef.current = true;
  }, [topoKey, nodesReady, nodes.length, layout]);

  // Start ELK when nodeMode changes
  useEffect(() => {
    if (nodes.length === 0) return;
    awaitingInitialRevealRef.current = true;
    setViewportReady(false);
    layout.restart();
    fitAfterLayoutRef.current = true;
  }, [configGraphNodeMode]);

  // Re-center on every successful "Load Machine".
  useEffect(() => {
    if (!nodesReady || nodes.length === 0) return;
    if (lastHandledMachineLoadRef.current === machineLoadVersion) return;
    lastHandledMachineLoadRef.current = machineLoadVersion;
    awaitingInitialRevealRef.current = true;
    setViewportReady(false);
    layout.restart();
    fitAfterLayoutRef.current = true;
  }, [machineLoadVersion, nodesReady, nodes.length]);

  // Fit after ELK transitions from running -> idle
  const storeViewport = useCallback(
    (viewport?: Viewport) => {
      viewportRef.current = viewport ?? rf.getViewport();
    },
    [rf]
  );

  const ensureStartNodeVisibleInRF = useCallback((): Viewport | null => {
    if (!(viewportWidth > 0) || !(viewportHeight > 0)) return null;
    const startNode = rf.getNodes().find((n) => (n.data as any)?.isStart === true);
    if (!startNode) return null;

    const viewport = rf.getViewport();
    if (!(viewport.zoom > 0)) return null;
    let nextViewport = viewport;

    const origin = Array.isArray(startNode.origin) ? startNode.origin : [0, 0];
    const ox = origin[0] ?? 0;
    const oy = origin[1] ?? 0;
    const width = startNode.measured?.width ?? startNode.width ?? 0;
    const height = startNode.measured?.height ?? startNode.height ?? 0;
    const pos = (startNode as any).positionAbsolute ?? startNode.position;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;

    const centerX = pos.x + (0.5 - ox) * width;
    const centerY = pos.y + (0.5 - oy) * height;
    const renderedX = centerX * nextViewport.zoom + nextViewport.x;
    const renderedY = centerY * nextViewport.zoom + nextViewport.y;

    const margin = 24;
    let dx = 0;
    let dy = 0;

    if (renderedX < margin) dx = margin - renderedX;
    else if (renderedX > viewportWidth - margin) dx = viewportWidth - margin - renderedX;

    if (renderedY < margin) dy = margin - renderedY;
    else if (renderedY > viewportHeight - margin) dy = viewportHeight - margin - renderedY;

    if (dx !== 0 || dy !== 0) {
      nextViewport = {
        x: nextViewport.x + dx,
        y: nextViewport.y + dy,
        zoom: nextViewport.zoom,
      };
    }

    const changed =
      nextViewport.x !== viewport.x ||
      nextViewport.y !== viewport.y ||
      nextViewport.zoom !== viewport.zoom;
    if (changed) void rf.setViewport(nextViewport, { duration: 0 });
    return nextViewport;
  }, [rf, viewportWidth, viewportHeight]);

  const runFitView = useCallback((onDone?: () => void) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rf.fitView({ padding: 0.2, duration: 0 });
        const correctedViewport = ensureStartNodeVisibleInRF();
        storeViewport(correctedViewport ?? undefined);
        onDone?.();
      });
    });
  }, [rf, storeViewport, ensureStartNodeVisibleInRF]);

  const restoreViewport = useCallback((onDone?: () => void) => {
    const viewport = viewportRef.current;
    if (!viewport) return false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void rf.setViewport(viewport, { duration: 0 });
        onDone?.();
      });
    });
    return true;
  }, [rf]);

  const restoreViewportOrFit = useCallback(
    (onDone?: () => void) => {
      if (restoreViewport(onDone)) return;
      runFitView(onDone);
    },
    [restoreViewport, runFitView]
  );

  const handleMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => {
      storeViewport(viewport);
    },
    [storeViewport]
  );

  useEffect(() => {
    if (viewportRef.current) return;
    storeViewport();
  }, [storeViewport]);

  useEffect(() => {
    const justFinished = prevRunningRef.current && !layout.running;
    if (justFinished) {
      if (fitAfterLayoutRef.current && nodes.length > 0) {
        fitAfterLayoutRef.current = false;
        const isHidden = viewportWidth <= 0 || viewportHeight <= 0;
        if (isHidden) {
          // Layout finished while tab is hidden — defer reveal until visible
          pendingReFitRef.current = true;
          // Still set viewportReady so the loading state tracks correctly
          if (awaitingInitialRevealRef.current) {
            awaitingInitialRevealRef.current = false;
          }
        } else {
          runFitView(() => {
            if (awaitingInitialRevealRef.current) {
              awaitingInitialRevealRef.current = false;
              setViewportReady(true);
            }
          });
        }
      }

      if (manualFitPendingRef.current && nodesCountRef.current > 0) {
        manualFitPendingRef.current = false;
        restoreViewportOrFit(() => {
          setViewportReady(true);
        });
      }
    }
    prevRunningRef.current = layout.running;
  }, [
    layout.running,
    nodes.length,
    restoreViewportOrFit,
    runFitView,
    viewportWidth,
    viewportHeight,
  ]);

  // Re-fit when viewport becomes visible after layout completed while hidden
  useEffect(() => {
    if (!pendingReFitRef.current) return;
    if (viewportWidth <= 0 || viewportHeight <= 0) return;
    pendingReFitRef.current = false;
    runFitView(() => {
      setViewportReady(true);
    });
  }, [viewportWidth, viewportHeight, runFitView]);

  useEffect(() => {
    const visible = viewportWidth > 0 && viewportHeight > 0;
    const wasVisible = viewportVisibleRef.current;
    viewportVisibleRef.current = visible;
    if (!visible || wasVisible) return;
    setViewportReady(false);
    if (layoutRunningRef.current) {
      manualFitPendingRef.current = true;
      return;
    }
    restoreViewportOrFit(() => {
      setViewportReady(true);
    });
  }, [viewportWidth, viewportHeight, restoreViewportOrFit]);

  // --- Handlers ---
  const handleNodeClick = useCallback(
    (evt: React.MouseEvent, node: RFNode) => {
      evt.stopPropagation();
      setSelected({
        type: 'node',
        id: node.id,
        anchor: { top: evt.clientY, left: evt.clientX },
      });
    },
    [setSelected]
  );

  const handleEdgeClick = useCallback(
    (evt: React.MouseEvent, edge: RFEdge) => {
      evt.stopPropagation();
      setSelected({
        type: 'edge',
        id: edge.id,
        anchor: { top: evt.clientY, left: evt.clientX },
      });
    },
    [setSelected]
  );

  const handlePaneClick = useCallback(() => {
    setSelected({ type: null, id: null });
    setSettingsOpen(false);
  }, [setSelected]);

  // Manual ELK restart via button; fit handled by running->idle effect
  const recalcLayout = useCallback(() => {
    layout.restart();
    fitAfterLayoutRef.current = true;
  }, [layout]);

  const scheduleViewportAfterSwitch = useCallback(() => {
    if (!nodesReadyRef.current || nodesCountRef.current === 0) return;
    setViewportReady(false);
    if (layoutRunningRef.current) {
      manualFitPendingRef.current = true;
      return;
    }
    manualFitPendingRef.current = false;
    restoreViewportOrFit(() => {
      if (awaitingInitialRevealRef.current) {
        awaitingInitialRevealRef.current = false;
      }
      setViewportReady(true);
    });
  }, [restoreViewportOrFit]);

  useEffect(() => {
    const handleBeforeSwitch: EventListener = (event) => {
      const detail = (event as CustomEvent<PortalBridgeSwitchDetail>).detail;
      if (!detail || detail.id !== 'configGraph') return;
      setViewportReady(false);
    };

    const handler: EventListener = (event) => {
      const detail = (event as CustomEvent<PortalBridgeSwitchDetail>).detail;
      if (!detail || detail.id !== 'configGraph') return;
      setAutoResizeLayoutEnabled(detail.location !== 'target');
      scheduleViewportAfterSwitch();
    };
    window.addEventListener(PORTAL_BRIDGE_BEFORE_SWITCH_EVENT, handleBeforeSwitch);
    window.addEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    return () => {
      window.removeEventListener(PORTAL_BRIDGE_BEFORE_SWITCH_EVENT, handleBeforeSwitch);
      window.removeEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    };
  }, [scheduleViewportAfterSwitch]);

  const resetToDefaults = useCallback(() => {
    setConfigGraphELKSettings({
      ...(configGraphNodeMode === ConfigNodeMode.CARDS
        ? DEFAULT_GRAPH_CARDS_ELK_OPTS
        : DEFAULT_GRAPH_ELK_OPTS),
    });
  }, [configGraphNodeMode, setConfigGraphELKSettings]);

  // Disable cards mode if too many nodes
  const nodeCount = configGraph?.Graph.size ?? 0;
  const cardsDisabled = nodeCount > CARDS_LIMIT;

  useEffect(() => {
    if (configGraphNodeMode === ConfigNodeMode.CARDS && cardsDisabled) {
      setConfigGraphNodeMode(ConfigNodeMode.NODES);
      toast.warning(
        `Cards are disabled when there are more than ${CARDS_LIMIT} nodes (current: ${nodeCount}).`
      );
    }
  }, [cardsDisabled, configGraphNodeMode, nodeCount, setConfigGraphNodeMode]);

  // Settings panel open state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmCardsOpen, setConfirmCardsOpen] = useState(false);

  // Legend (Color -> State) items
  // Build a sorted list for stable rendering
  const legendItems = useMemo(() => {
    const entries = Array.from(stateColorMatching.entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([state, color]) => ({ key: state, color }));
  }, [stateColorMatching]);

  const showLegend =
    legendItems.length > 0 && (configGraph?.Graph.size ?? 0) > 0;

  const requestNodeModeChange = useCallback(
    (nextMode: ConfigNodeMode) => {
      if (nextMode === ConfigNodeMode.CARDS && cardsDisabled) {
        toast.info(
          `Cards are disabled when there are more than ${CARDS_LIMIT} nodes (current: ${nodeCount}).`
        );
        return;
      }
      if (
        nextMode === ConfigNodeMode.CARDS &&
        nodeCount > CARDS_CONFIRM_THRESHOLD
      ) {
        setConfirmCardsOpen(true);
        return;
      }
      setConfigGraphNodeMode(nextMode);
    },
    [cardsDisabled, nodeCount, setConfigGraphNodeMode]
  );

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 360 }}>
      <ReactFlow
        id="ConfigGraph"
        style={{
          width: '100%',
          height: '100%',
          minHeight: 360,
          opacity: loadingMaskVisible ? 0 : 1,
          pointerEvents: loadingMaskVisible ? 'none' : 'auto',
          transition: loadingMaskVisible ? 'none' : 'opacity 120ms ease',
        }}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeRF}
        onEdgesChange={onEdgesChangeRF}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onPaneClick={handlePaneClick}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onMoveEnd={handleMoveEnd}
        defaultEdgeOptions={defaultEdgeOptions}
        proOptions={{ hideAttribution: true }}
        minZoom={0.05}
        maxZoom={2.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.1 }}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick
        nodesDraggable={false}
        onlyRenderVisibleElements
      >
      {showDeveloperControls && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: (t) => t.zIndex.appBar + 1,
            pointerEvents: 'auto',
          }}
        >
          <Tooltip title="Layout settings">
            <Fab
              size="small"
              variant="extended"
              color="primary"
              onClick={() => setSettingsOpen((v) => !v)}
              sx={{
                textTransform: 'none',
                boxShadow: (t) => `0 4px 12px ${alpha(t.palette.common.black, 0.2)}`,
                '& .MuiSvgIcon-root': { mr: 0.75, fontSize: 18 },
                px: 1.5,
                minHeight: 32,
              }}
            >
              <Tune />
              Layout
            </Fab>
          </Tooltip>
        </Box>
      )}
      {/* Layout settings panel */}
      <LayoutSettingsPanel
        open={showDeveloperControls && settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={configGraphELKSettings}
        onChange={(next) => setConfigGraphELKSettings(next)}
        onReset={resetToDefaults}
        onRecalc={recalcLayout}
        running={layout.running}
        mode={configGraphNodeMode}
      />
      <Dialog open={confirmCardsOpen} onClose={() => setConfirmCardsOpen(false)}>
        <DialogTitle>Switch to card view?</DialogTitle>
        <DialogContent>
          Card view can be slow for graphs above {CARDS_CONFIRM_THRESHOLD} nodes
          (current: {nodeCount}). Continue?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCardsOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              setConfirmCardsOpen(false);
              setConfigGraphNodeMode(ConfigNodeMode.CARDS);
            }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>
      {/* Top-left controls panel (fit view and node mode switch) */}
      <Box
        sx={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: (t) => t.zIndex.appBar + 1,
          pointerEvents: 'auto',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          {/* Button for fitting the current graph into view */}
          <Button
            size="small"
            variant="contained"
            onClick={() => runFitView()}
            disabled={loadingMaskVisible}
            startIcon={<CenterFocusStrong fontSize="small" />}
            sx={{
              height: CONTROL_HEIGHT,
              borderRadius: 1.5,
              textTransform: 'none',
              px: 1.25,
            }}
          >
            Fit view
          </Button>

          {/* Node rendering mode toggle */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={configGraphNodeMode}
            onChange={(_, v) => {
              if (!v) return;
              requestNodeModeChange(v);
            }}
            aria-label="node rendering mode"
            sx={{
              height: CONTROL_HEIGHT,
              borderRadius: 1.5,
              overflow: 'hidden',
              border: (theme) => `1px solid ${theme.palette.divider}`,
              '& .MuiToggleButton-root': {
                height: CONTROL_HEIGHT,
                border: 'none',
                borderRadius: 0,
                textTransform: 'none',
                fontWeight: 500,
                px: 1.25,
                py: 0,
                boxShadow: (theme) => `inset 1px 0 0 ${theme.palette.divider}`,
                '&:first-of-type': { boxShadow: 'none' },
              },
              '& .Mui-selected': (theme) => ({
                backgroundColor: theme.palette.primary.main,
                color: theme.palette.primary.contrastText,
                '&:hover': { backgroundColor: theme.palette.primary.dark },
              }),
            }}
          >
            <ToggleButton value={ConfigNodeMode.NODES} aria-label="nodes">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Adjust fontSize="small" />
                <span>Nodes</span>
              </Stack>
            </ToggleButton>

            {cardsDisabled ? (
              <Tooltip
                title={`Cards are disabled for graphs with more than ${CARDS_LIMIT} nodes.`}
                placement="top"
                disableInteractive
              >
                <span>
                  <ToggleButton
                    value={ConfigNodeMode.CARDS}
                    aria-label="card nodes"
                    disabled
                  >
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <ViewAgenda fontSize="small" />
                      <span>Cards</span>
                    </Stack>
                  </ToggleButton>
                </span>
              </Tooltip>
            ) : (
              <ToggleButton value={ConfigNodeMode.CARDS} aria-label="card nodes">
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <ViewAgenda fontSize="small" />
                  <span>Cards</span>
                </Stack>
              </ToggleButton>
            )}
          </ToggleButtonGroup>
        </Stack>
      </Box>

      {/* Legend panel */}
      <LegendPanel
        items={legendItems}
        visible={showLegend}
        hoveredKey={hoveredState}
        contentClassName="ct-scrollable"
      />

        <Background gap={10} size={1} />
      </ReactFlow>

      {loadingMaskVisible && (
        <LoadingOverlay
          label={configGraphComputing ? 'Computing graph...' : 'Calculating layout...'}
        />
      )}
    </Box>
  );
}

export function ConfigGraph() {
  const nodeMode = useConfigGraphNodeMode();
  if (nodeMode === ConfigNodeMode.CARDS) return <ConfigGraphCards />;
  return <ConfigGraphCircles />;
}

export function ConfigGraphWrapper() {
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);
  return (
    <ReactFlowProvider>
      <GraphUIProvider key={machineLoadVersion}>
        <ConfigGraph />
      </GraphUIProvider>
    </ReactFlowProvider>
  );
}
