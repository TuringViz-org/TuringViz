// src/components/TMGraph/TMGraph.tsx
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  MarkerType,
  Panel,
  useReactFlow,
  useNodesInitialized,
  Controls,
  Background,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box, Stack, Tooltip, Fab, Button } from '@mui/material';
import { Cached, Tune } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useMemo, useEffect, useRef, useState, useCallback } from 'react';

import { StateNode } from './nodes/StateNode';
import { LoopEdge } from './edges/LoopEdge';
import { FloatingEdge } from './edges/FloatingEdge';

import { useElkLayout } from './layout/useElkLayout';
import { LayoutSettingsPanel } from './layout/LayoutSettingsPanel';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { useTMGraphELKSettings, useGraphZustand } from '@zustands/GraphZustand';
import { buildTMGraph } from './util/buildTMGraph';
import { NodeType, EdgeType, CONTROL_HEIGHT } from './util/constants';
import { DEFAULT_ELK_OPTS } from '@utils/constants';
import { GraphUIProvider, useGraphUI } from '@components/shared/GraphUIContext';
import {
  PORTAL_BRIDGE_SWITCH_EVENT,
  type PortalBridgeSwitchDetail,
} from '@components/MainPage/PortalBridge';
import { reconcileNodes, reconcileEdges } from '@utils/reactflow';
import { useDebouncedLayoutRestart } from '@hooks/useDebouncedLayoutRestart';

const nodeTypes = {
  [NodeType.STATE]: StateNode,
};
const edgeTypes = {
  [EdgeType.LOOP]: LoopEdge,
  [EdgeType.FLOATING]: FloatingEdge,
};

const defaultEdgeOptions = {
  type: EdgeType.FLOATING,
  markerEnd: {
    type: MarkerType.ArrowClosed,
  },
};

type BuildTMGraphArgs = Parameters<typeof buildTMGraph>;
type TMGraphBuildResult = ReturnType<typeof buildTMGraph>;
type TMGraphNode = TMGraphBuildResult['nodes'][number];

function useTMGraphData({
  states,
  transitions,
  startState,
  currentState,
  lastState,
}: {
  states: BuildTMGraphArgs[0];
  transitions: BuildTMGraphArgs[1];
  startState: BuildTMGraphArgs[2];
  currentState: BuildTMGraphArgs[3];
  lastState: BuildTMGraphArgs[4];
}) {
  const { nodes: rawNodes, edges: rawEdges } = useMemo(
    () => buildTMGraph(states, transitions, startState, currentState, lastState),
    [states, transitions, startState, currentState, lastState]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(rawNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges);

  useEffect(() => {
    setNodes((prev) =>
      reconcileNodes(prev, rawNodes, (node) => ({
        ...(node.data as any),
        isStart: node.id === startState,
        isCurrent: node.id === currentState,
        isLast: node.id === lastState,
      }))
    );
    setEdges((prev) => reconcileEdges(prev, rawEdges));
  }, [rawNodes, rawEdges, startState, currentState, lastState, setNodes, setEdges]);

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
  };
}

function useHighlightedTransition({
  lastState,
  lastTransition,
  transitions,
  lastTransitionTrigger,
  runSpeedMs,
  setHighlightedEdgeId,
}: {
  lastState: BuildTMGraphArgs[4];
  lastTransition: number;
  transitions: BuildTMGraphArgs[1];
  lastTransitionTrigger: unknown;
  runSpeedMs: number;
  setHighlightedEdgeId: (edgeId: string | null) => void;
}) {
  const runSpeedMsRef = useRef(runSpeedMs);
  useEffect(() => {
    runSpeedMsRef.current = runSpeedMs;
  }, [runSpeedMs]);

  useEffect(() => {
    if (!lastState || lastTransition === -1) return;

    const ts = transitions.get(lastState);
    if (!ts || !ts[lastTransition]) return;

    const t = ts[lastTransition];
    const from = t.from;
    const to = t.to ?? from;

    const edgeId = `${from}→${to}`;
    setHighlightedEdgeId(edgeId);

    // Keep edge highlight shorter for fast run speeds so repeated hits can still pulse.
    const highlightMs = Math.max(
      60,
      Math.min(400, Math.round(runSpeedMsRef.current * 0.55))
    );
    const timeout = setTimeout(() => setHighlightedEdgeId(null), highlightMs);
    return () => clearTimeout(timeout);
  }, [
    lastTransition,
    lastState,
    transitions,
    lastTransitionTrigger,
    setHighlightedEdgeId,
  ]);
}

function useAutoLayout({
  layout,
  nodes,
  edges,
  rf,
  portalId,
  machineLoadVersion,
}: {
  layout: ReturnType<typeof useElkLayout>;
  nodes: TMGraphNode[];
  edges: TMGraphBuildResult['edges'];
  rf: ReturnType<typeof useReactFlow>;
  portalId: string;
  machineLoadVersion: number;
}) {
  const scheduleLayoutRestart = useDebouncedLayoutRestart(layout);
  const nodesReady = useNodesInitialized();
  const lastTopoKeyRef = useRef<string | null>(null);
  // Treat the currently mounted machine as already handled so we don't
  // run a delayed "load" recenter during the first simulation step.
  const lastHandledMachineLoadRef = useRef<number>(machineLoadVersion);
  const fitAfterLayoutRef = useRef(false);
  const layoutRunningRef = useRef(layout.running);
  const nodesReadyRef = useRef(nodesReady);
  const nodesCountRef = useRef(0);
  const manualFitPendingRef = useRef(false);
  const prevRunningRef = useRef(layout.running);
  const machineLoadFrameRef = useRef<number | null>(null);
  const awaitingRevealRef = useRef(false);
  const [viewportReady, setViewportReady] = useState(false);

  useEffect(() => {
    layoutRunningRef.current = layout.running;
  }, [layout.running]);

  useEffect(() => {
    nodesReadyRef.current = nodesReady;
  }, [nodesReady]);

  useEffect(() => {
    nodesCountRef.current = nodes.length;
  }, [nodes.length]);

  useEffect(() => {
    return () => {
      if (machineLoadFrameRef.current !== null) {
        cancelAnimationFrame(machineLoadFrameRef.current);
      }
    };
  }, []);

  const requestLayoutAndFit = useCallback(() => {
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [scheduleLayoutRestart]);

  const requestLayoutFitAndReveal = useCallback(() => {
    awaitingRevealRef.current = true;
    setViewportReady(false);
    requestLayoutAndFit();
  }, [requestLayoutAndFit]);

  const topoKey = useMemo(() => {
    const nIds = nodes.map((n) => n.id).sort();
    const eKeys = Array.from(new Set(edges.map((e) => `${e.source}→${e.target}`))).sort();
    return `${nIds.join('|')}__${eKeys.join('|')}`;
  }, [nodes, edges]);

  useEffect(() => {
    if (!nodesReady || nodes.length === 0) return;
    if (lastTopoKeyRef.current === topoKey) return;
    lastTopoKeyRef.current = topoKey;

    requestLayoutFitAndReveal();
  }, [topoKey, nodesReady, nodes.length, requestLayoutFitAndReveal]);

  // Re-center on every successful "Load Machine".
  useEffect(() => {
    if (!nodesReady || nodes.length === 0) return;
    if (lastHandledMachineLoadRef.current === machineLoadVersion) return;
    lastHandledMachineLoadRef.current = machineLoadVersion;
    if (machineLoadFrameRef.current !== null) {
      cancelAnimationFrame(machineLoadFrameRef.current);
    }
    machineLoadFrameRef.current = requestAnimationFrame(() => {
      machineLoadFrameRef.current = null;
      if (!nodesReadyRef.current || nodesCountRef.current === 0) return;
      requestLayoutFitAndReveal();
    });
  }, [machineLoadVersion, nodesReady, nodes.length, requestLayoutFitAndReveal]);

  const runFitView = useCallback((onDone?: () => void) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rf.fitView({ padding: 0.2, duration: 300 });
        onDone?.();
      });
    });
  }, [rf]);

  useEffect(() => {
    const justFinished = prevRunningRef.current && !layout.running;
    if (justFinished) {
      if (fitAfterLayoutRef.current && nodes.length > 0) {
        fitAfterLayoutRef.current = false;
        runFitView(() => {
          if (awaitingRevealRef.current) {
            awaitingRevealRef.current = false;
            setViewportReady(true);
          }
        });
      }

      if (manualFitPendingRef.current && nodesCountRef.current > 0) {
        manualFitPendingRef.current = false;
        runFitView();
      }
    }

    prevRunningRef.current = layout.running;
  }, [layout.running, nodes.length, runFitView]);

  const recalcLayout = useCallback(() => {
    requestLayoutAndFit();
  }, [requestLayoutAndFit]);

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
      if (!detail || detail.id !== portalId) return;
      scheduleFitAfterSwitch();
    };

    window.addEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    return () => {
      window.removeEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    };
  }, [portalId, scheduleFitAfterSwitch]);

  useEffect(() => {
    if (nodes.length === 0) {
      awaitingRevealRef.current = false;
      setViewportReady(true);
    }
  }, [nodes.length]);

  return { recalcLayout, viewportReady };
}

// --- Component ---
function TMGraph() {
  const states = useGlobalZustand((s) => s.states);
  const transitions = useGlobalZustand((s) => s.transitions);
  const startState = useGlobalZustand((s) => s.startState);
  const currentState = useGlobalZustand((s) => s.currentState);
  const lastState = useGlobalZustand((s) => s.lastState);
  const lastTransition = useGlobalZustand((s) => s.lastTransition);
  const lastTransitionTrigger = useGlobalZustand((s) => s.lastTransitionTrigger);
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);
  const runSpeedMs = useGlobalZustand((s) => s.runSpeedMs);

  const tmGraphELKSettings = useTMGraphELKSettings();
  const setTMGraphELKSettings = useGraphZustand((s) => s.setTMGraphELKSettings);

  const { setHighlightedEdgeId, setSelected } = useGraphUI();

  const rf = useReactFlow();

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
  } = useTMGraphData({
    states,
    transitions,
    startState,
    currentState,
    lastState,
  });

  useHighlightedTransition({
    lastState,
    lastTransition,
    transitions,
    lastTransitionTrigger,
    runSpeedMs,
    setHighlightedEdgeId,
  });

  const layout = useElkLayout({
    algorithm: tmGraphELKSettings.algorithm,
    nodeSep: tmGraphELKSettings.nodeSep,
    rankSep: tmGraphELKSettings.rankSep,
    edgeSep: tmGraphELKSettings.edgeSep,
    padding: tmGraphELKSettings.padding,
    direction: tmGraphELKSettings.direction,
  });

  const { recalcLayout, viewportReady } = useAutoLayout({
    layout,
    nodes,
    edges,
    rf,
    portalId: 'tmGraph',
    machineLoadVersion,
  });

  const [settingsOpen, setSettingsOpen] = useState(false);

  const resetToDefaults = useCallback(() => {
    setTMGraphELKSettings({ ...DEFAULT_ELK_OPTS });
  }, [setTMGraphELKSettings]);

  const handlePaneClick = useCallback(() => {
    setSelected({ type: null, id: null });
    setSettingsOpen(false);
  }, [setSelected, setSettingsOpen]);

  return (
    <ReactFlow
      id="TMGraph"
      style={{
        width: '100%',
        height: '100%',
        opacity: viewportReady ? 1 : 0,
        transition: 'opacity 120ms ease',
      }}
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onPaneClick={handlePaneClick}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      proOptions={{ hideAttribution: true }}
      minZoom={0.25}
      defaultViewport={{ x: 0, y: 0, zoom: 1 }}
    >
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

      <LayoutSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={tmGraphELKSettings}
        onChange={(next) => setTMGraphELKSettings(next)}
        onReset={resetToDefaults}
        onRecalc={recalcLayout}
        running={layout.running}
      />

      <Panel position="top-left">
        <Stack direction="row" spacing={1} alignItems="center">
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
        </Stack>
      </Panel>

      <Controls />
      <Background gap={10} size={1} />
    </ReactFlow>
  );
}

export function TMGraphWrapper() {
  return (
    <ReactFlowProvider>
      <GraphUIProvider>
        <TMGraph />
      </GraphUIProvider>
    </ReactFlowProvider>
  );
}
