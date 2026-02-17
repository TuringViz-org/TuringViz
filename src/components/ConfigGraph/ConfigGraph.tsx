// src/components/ConfigGraph/ConfigGraph.tsx
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useNodesInitialized,
  Controls,
  Panel,
  MarkerType,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  type Node as RFNode,
  type Edge as RFEdge,
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
} from '@mui/material';
import {
  Adjust,
  ViewAgenda,
  Cached,
  Tune,
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
import { CARDS_CONFIRM_THRESHOLD, ConfigNodeMode } from '@utils/constants';
import { LayoutSettingsPanel } from './layout/LayoutSettingsPanel';

import { DEFAULT_ELK_OPTS } from '@utils/constants';
import { reconcileNodes, reconcileEdges } from '@utils/reactflow';
import { GraphUIProvider, useGraphUI } from '@components/shared/GraphUIContext';
import {
  PORTAL_BRIDGE_SWITCH_EVENT,
  type PortalBridgeSwitchDetail,
} from '@components/MainPage/PortalBridge';
import { ConfigGraphCircles } from './ConfigGraphCircles';

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
  });

  // Adjust edgeNodeSep when nodeMode changes (Cards need more space)
  useEffect(() => {
    setConfigGraphELKSettings({
      ...configGraphELKSettings,
      edgeNodeSep: configGraphNodeMode === ConfigNodeMode.CARDS ? 300 : 100,
    });
  }, [configGraphNodeMode]);

  // Performance measurement
  const nodesCountRef = useRef(0);
  const edgesCountRef = useRef(0);

  const nodesReady = useNodesInitialized();
  const didInitialLayoutRef = useRef(false); // Track initial ELK run
  const lastTopoKeyRef = useRef<string | null>(null); // Structural change detection
  const fitAfterLayoutRef = useRef(false); // Request fit after ELK run
  const layoutRunningRef = useRef(layout.running);
  const nodesReadyRef = useRef(nodesReady);
  const prevRunningRef = useRef(layout.running); // Detect running -> idle
  const manualFitPendingRef = useRef(false);

  useEffect(() => {
    nodesCountRef.current = nodes.length;
  }, [nodes.length]);
  useEffect(() => {
    edgesCountRef.current = edges.length;
  }, [edges.length]);
  useEffect(() => {
    layoutRunningRef.current = layout.running;
  }, [layout.running]);
  useEffect(() => {
    nodesReadyRef.current = nodesReady;
  }, [nodesReady]);

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

  // Start ELK once when nodes are ready
  useEffect(() => {
    if (!didInitialLayoutRef.current && nodesReady && nodes.length > 0) {
      didInitialLayoutRef.current = true;
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

    layout.restart();
    fitAfterLayoutRef.current = true;
  }, [topoKey, nodesReady, nodes.length, layout]);

  // Start ELK when nodeMode changes
  useEffect(() => {
    if (nodes.length === 0) return;
    layout.restart();
    fitAfterLayoutRef.current = true;
  }, [configGraphNodeMode]);

  // Re-center on every successful "Load Machine".
  useEffect(() => {
    if (!nodesReady || nodes.length === 0) return;
    layout.restart();
    fitAfterLayoutRef.current = true;
  }, [machineLoadVersion, nodesReady, nodes.length, layout]);

  // Fit after ELK transitions from running -> idle
  const runFitView = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rf.fitView({ padding: 0.2, duration: 0 });
      });
    });
  }, [rf]);

  useEffect(() => {
    const justFinished = prevRunningRef.current && !layout.running;
    if (justFinished) {
      if (fitAfterLayoutRef.current && nodes.length > 0) {
        fitAfterLayoutRef.current = false;
        runFitView();
      }

      if (manualFitPendingRef.current && nodesCountRef.current > 0) {
        manualFitPendingRef.current = false;
        runFitView();
      }
    }
    prevRunningRef.current = layout.running;
  }, [layout.running, nodes.length, runFitView]);

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

  const scheduleFitAfterSwitch = useCallback(() => {
    if (!nodesReadyRef.current || nodesCountRef.current === 0) return;
    if (layoutRunningRef.current) {
      manualFitPendingRef.current = true;
      return;
    }
    manualFitPendingRef.current = false;
    runFitView();
  }, [runFitView]);

  useEffect(() => {
    const handler: EventListener = (event) => {
      const detail = (event as CustomEvent<PortalBridgeSwitchDetail>).detail;
      if (!detail || detail.id !== 'configGraph') return;
      scheduleFitAfterSwitch();
    };
    window.addEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    return () => {
      window.removeEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    };
  }, [scheduleFitAfterSwitch]);

  const resetToDefaults = useCallback(() => {
    setConfigGraphELKSettings({
      ...DEFAULT_ELK_OPTS,
      edgeNodeSep: configGraphNodeMode === ConfigNodeMode.CARDS ? 300 : 100,
    });
  }, [configGraphNodeMode]);

  // Disable cards mode if too many nodes
  const nodeCount = configGraph?.Graph.size ?? 0;
  const cardsDisabled = nodeCount > CARDS_LIMIT;

  useEffect(() => {
    if (configGraphNodeMode === ConfigNodeMode.CARDS && cardsDisabled) {
      setConfigGraphNodeMode(ConfigNodeMode.CIRCLES);
      toast.warning(
        `Cards are disabled when there are more than ${CARDS_LIMIT} nodes (current: ${nodeCount}).`
      );
    }
  }, [cardsDisabled, configGraphNodeMode, nodeCount, setConfigGraphNodeMode]);

  // Settings panel open state
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Legend (Color -> State) items
  // Build a sorted list for stable rendering
  const legendItems = useMemo(() => {
    const entries = Array.from(stateColorMatching.entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([state, color]) => ({ key: state, color }));
  }, [stateColorMatching]);

  const showLegend =
    (configGraph?.Graph.size ?? 0) >= COLOR_STATE_SWITCH &&
    configGraphNodeMode === ConfigNodeMode.CIRCLES;

  return (
    <ReactFlow
      id="ConfigGraph"
      style={{ width: '100%', height: '100%', minHeight: 360 }}
      nodes={nodes}
      edges={edges}
      onNodesChange={(changes) => setNodes((nds) => applyNodeChanges(changes, nds))}
      onEdgesChange={(changes) => setEdges((eds) => applyEdgeChanges(changes, eds))}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onPaneClick={handlePaneClick}
      onNodeClick={handleNodeClick}
      onEdgeClick={handleEdgeClick}
      defaultEdgeOptions={defaultEdgeOptions}
      proOptions={{ hideAttribution: true }}
      minZoom={0.05}
      defaultViewport={{ x: 0, y: 0, zoom: 0.1 }}
      onlyRenderVisibleElements
    >
      {/* Layout settings panel trigger button */}
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
      {/* Layout settings panel */}
      <LayoutSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={configGraphELKSettings}
        onChange={(next) => setConfigGraphELKSettings(next)}
        onReset={resetToDefaults}
        onRecalc={() => {
          recalcLayout();
        }}
        running={layout.running}
      />
      {/* Top-left controls panel (recalculate layout and node mode switch) */}
      <Panel position="top-left">
        <Stack direction="row" spacing={1} alignItems="center">
          {/* Button for recalculating layout */}
          <Button
            size="small"
            variant="contained"
            onClick={recalcLayout}
            disabled={layout.running}
            startIcon={<Cached fontSize="small" />}
            sx={{
              height: CONTROL_HEIGHT,
              borderRadius: 1.5,
              textTransform: 'none',
              px: 1.25,
            }}
          >
            Recalculate layout
          </Button>

          {/* Node rendering mode toggle */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={configGraphNodeMode}
            onChange={(_, v) => {
              if (!v) return;
              if (v === ConfigNodeMode.CARDS && cardsDisabled) {
                toast.info(
                  `Cards are disabled when there are more than ${CARDS_LIMIT} nodes (current: ${nodeCount}).`
                );
                return;
              }
              if (
                v === ConfigNodeMode.CARDS &&
                nodeCount > CARDS_CONFIRM_THRESHOLD &&
                !window.confirm(
                  'Switching to card view can be very slow with many nodes. Continue?'
                )
              ) {
                return;
              }
              setConfigGraphNodeMode(v);
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
            <ToggleButton value={ConfigNodeMode.CIRCLES} aria-label="circle nodes">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Adjust fontSize="small" />
                <span>Circles</span>
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
      </Panel>

      {/* Legend panel */}
      <LegendPanel
        items={legendItems}
        visible={showLegend}
        hoveredKey={hoveredState}
        contentClassName="ct-scrollable"
      />

      <Controls />
      <Background gap={10} size={1} />
    </ReactFlow>
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
