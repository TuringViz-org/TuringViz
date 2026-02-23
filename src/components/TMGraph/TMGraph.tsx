// src/components/TMGraph/TMGraph.tsx
import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import cytoscape, {
  type Core as CyCore,
  type EventObject,
  type EventObjectEdge,
  type EventObjectNode,
  type Stylesheet,
} from 'cytoscape';
import {
  Box,
  Stack,
  Tooltip,
  Fab,
  Button,
  Popper,
  Paper,
  Typography,
  IconButton,
} from '@mui/material';
import { Cached, Tune, Add, Remove, CenterFocusStrong } from '@mui/icons-material';
import { alpha, useTheme } from '@mui/material/styles';
import type { VirtualElement } from '@popperjs/core';

import { useElkLayout } from '@components/ComputationTree/layout/useElkLayout';
import { LayoutSettingsPanel } from './layout/LayoutSettingsPanel';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  useTMGraphELKSettings,
  useGraphZustand,
  type TMGraphLayoutSnapshot,
  type TMGraphViewportSnapshot,
} from '@zustands/GraphZustand';
import { buildTMGraph } from './util/buildTMGraph';
import { CONTROL_HEIGHT, STATE_NODE_DIAMETER } from './util/constants';
import { DEFAULT_ELK_OPTS, HOVER_POPPER_DELAY_MS } from '@utils/constants';
import { GraphUIProvider, useGraphUI } from '@components/shared/GraphUIContext';
import type { Transition } from '@mytypes/TMTypes';
import {
  PORTAL_BRIDGE_SWITCH_EVENT,
  type PortalBridgeSwitchDetail,
} from '@components/MainPage/PortalBridge';
import { reconcileEdges, reconcileNodes } from '@utils/reactflow';
import { useDebouncedLayoutRestart } from '@hooks/useDebouncedLayoutRestart';
import { EdgeTooltip } from './edges/EdgeTooltip';
import {
  GRAPH_EDGE_ACTIVE_WIDTH,
  GRAPH_EDGE_ARROW_SCALE,
  GRAPH_EDGE_BASE_WIDTH,
  GRAPH_EDGE_HOVER_WIDTH,
} from '@components/shared/edgeVisualConstants';
import { handleTMGraphRunChoiceEdgeClick } from '@tmfunctions/Running';

type BuildTMGraphArgs = Parameters<typeof buildTMGraph>;
type TransitionMap = Map<string, Transition[]>;
type TMGraphBuildResult = ReturnType<typeof buildTMGraph>;
type TMGraphNode = TMGraphBuildResult['nodes'][number];
type TMGraphEdge = TMGraphBuildResult['edges'][number];

type Anchor = { top: number; left: number };

type EdgeTooltipState = {
  id: string | null;
  anchor: Anchor | null;
  reason: 'hover' | 'select' | null;
};

type NodeHintState = {
  id: string | null;
  text: string | null;
  anchor: Anchor | null;
};

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

function makeVirtualAnchor(anchor: Anchor | null): VirtualElement {
  const top = anchor?.top ?? 0;
  const left = anchor?.left ?? 0;
  return {
    getBoundingClientRect: () =>
      ({
        width: 0,
        height: 0,
        x: left,
        y: top,
        top,
        left,
        right: left,
        bottom: top,
        toJSON: () => {},
      }) as DOMRect,
  };
}

function getNodeRoles(label: string, isStart: boolean, isCurrent: boolean, isLast: boolean) {
  const roles: string[] = [];
  if (isStart) roles.push('Start state');
  if (isCurrent) roles.push('Current state');
  if (isLast) roles.push('Last state');

  const l = label.toLowerCase();
  if (['done', 'accept', 'accepted'].includes(l)) roles.push('Accepting state');
  if (['error', 'reject', 'rejected'].includes(l)) roles.push('Rejecting state');

  return roles;
}

const getCyStyles = (theme: ReturnType<typeof useTheme>): Stylesheet[] => {
  const baseEdge = theme.palette.grey[500];
  const hoverEdge = theme.palette.grey[700];
  const selectedEdge = theme.palette.primary.dark;

  return [
    {
      selector: 'core',
      style: {
        'active-bg-color': theme.palette.grey[500],
        'active-bg-opacity': 0.2,
        'active-bg-size': 28,
        'selection-box-opacity': 0,
        'selection-box-border-width': 0,
      },
    },
    {
      selector: 'node',
      style: {
        width: STATE_NODE_DIAMETER,
        height: STATE_NODE_DIAMETER,
        label: '',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 16,
        'font-weight': 700,
        color: theme.palette.text.primary,
        'background-color': normalizeColor(theme.palette.background.paper),
        'border-width': 3,
        'border-color': normalizeColor(theme.palette.border.main),
        'border-style': 'solid',
        shape: 'ellipse',
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'node[label]',
      style: { label: 'data(label)' },
    },
    {
      selector: 'node[width]',
      style: { width: 'data(width)' },
    },
    {
      selector: 'node[height]',
      style: { height: 'data(height)' },
    },
    {
      selector: 'node[bgColor]',
      style: { 'background-color': 'data(bgColor)' },
    },
    {
      selector: 'node[borderWidth]',
      style: { 'border-width': 'data(borderWidth)' },
    },
    {
      selector: 'node[borderColor]',
      style: { 'border-color': 'data(borderColor)' },
    },
    {
      selector: 'node.start',
      style: {
        'border-style': 'double',
        'border-width': 6,
      },
    },
    {
      selector: 'node.current',
      style: {
        'border-width': 6,
      },
    },
    {
      selector: 'node.last',
      style: {
        'border-width': 6,
      },
    },
    {
      selector: 'edge',
      style: {
        width: GRAPH_EDGE_BASE_WIDTH,
        'line-color': baseEdge,
        'target-arrow-color': baseEdge,
        'target-arrow-shape': 'triangle',
        'arrow-scale': GRAPH_EDGE_ARROW_SCALE,
        'curve-style': 'straight',
        'line-opacity': 0.85,
        label: '',
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'edge.loop',
      style: {
        'curve-style': 'bezier',
        'loop-direction': '-45deg',
        'loop-sweep': '75deg',
        'control-point-step-size': 64,
      },
    },
    {
      selector: 'edge.bended',
      style: {
        'curve-style': 'unbundled-bezier',
        'control-point-distances': 'data(curveDistance)',
        'control-point-weights': 0.5,
      },
    },
    {
      selector: 'edge.hovered',
      style: {
        width: GRAPH_EDGE_HOVER_WIDTH,
        'line-color': hoverEdge,
        'target-arrow-color': hoverEdge,
        'line-opacity': 1,
      },
    },
    {
      selector: 'edge.ct-selected',
      style: {
        width: GRAPH_EDGE_ACTIVE_WIDTH,
        'line-color': selectedEdge,
        'target-arrow-color': selectedEdge,
        'line-opacity': 1,
      },
    },
    {
      selector: 'edge.tm-highlighted',
      style: {
        width: 3.5,
        'line-color': normalizeColor(theme.palette.primary.main),
        'target-arrow-color': normalizeColor(theme.palette.primary.main),
        'line-opacity': 0.95,
      },
    },
  ];
};

function applySnapshotPositions(
  nodes: TMGraphNode[],
  positions: TMGraphLayoutSnapshot['positions']
): TMGraphNode[] {
  return nodes.map((node) => {
    const saved = positions[node.id];
    if (!saved) return node;
    const same = node.position.x === saved.x && node.position.y === saved.y;
    return same ? node : { ...node, position: saved };
  });
}

function isDegenerateSnapshot(
  nodes: TMGraphNode[],
  positions: TMGraphLayoutSnapshot['positions']
): boolean {
  if (nodes.length <= 1) return false;
  const points = new Set<string>();

  for (const node of nodes) {
    const pos = positions[node.id];
    if (!pos) return true;
    points.add(`${Math.round(pos.x)}:${Math.round(pos.y)}`);
    if (points.size > 1) return false;
  }

  return true;
}

function useTMGraphData({
  states,
  transitions,
  startState,
  currentState,
  lastState,
  machineLoadVersion,
  snapshot,
}: {
  states: BuildTMGraphArgs[0];
  transitions: BuildTMGraphArgs[1];
  startState: string;
  currentState: string;
  lastState: string;
  machineLoadVersion: number;
  snapshot: TMGraphLayoutSnapshot | null;
}) {
  const { nodes: rawNodes, edges: rawEdges, topoKey } = useMemo(
    () => buildTMGraph(states, transitions),
    [states, transitions]
  );

  const applicableSnapshot = useMemo(() => {
    if (!snapshot) return null;
    if (snapshot.machineLoadVersion !== machineLoadVersion) return null;
    if (snapshot.topoKey !== topoKey) return null;
    if (isDegenerateSnapshot(rawNodes, snapshot.positions)) return null;
    return snapshot;
  }, [snapshot, machineLoadVersion, topoKey, rawNodes]);

  const baseNodes = useMemo(
    () =>
      applicableSnapshot
        ? applySnapshotPositions(rawNodes, applicableSnapshot.positions)
        : rawNodes,
    [rawNodes, applicableSnapshot]
  );

  const [nodes, setNodes] = useState<TMGraphNode[]>(baseNodes);
  const [edges, setEdges] = useState<TMGraphEdge[]>(rawEdges);

  useEffect(() => {
    setNodes((prev) =>
      reconcileNodes(prev, baseNodes, (node) => ({
        ...(node.data as any),
        isStart: node.id === startState,
        isCurrent: node.id === currentState,
        isLast: node.id === lastState,
      })) as TMGraphNode[]
    );
    setEdges((prev) => reconcileEdges(prev, rawEdges) as TMGraphEdge[]);
  }, [baseNodes, rawEdges, startState, currentState, lastState]);

  return {
    nodes,
    edges,
    setNodes,
    topoKey,
    expectedNodeKey: rawNodes
      .map((n) => n.id)
      .sort((a, b) => a.localeCompare(b))
      .join('|'),
    expectedEdgeKey: rawEdges
      .map((e) => e.id)
      .sort((a, b) => a.localeCompare(b))
      .join('|'),
    restoredSnapshot: applicableSnapshot,
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
  lastState: string;
  lastTransition: number;
  transitions: TransitionMap;
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

function NodeHintPopper({
  hint,
  open,
}: {
  hint: NodeHintState;
  open: boolean;
}) {
  if (!hint.text || !hint.anchor) return null;

  return (
    <Popper
      open={open}
      anchorEl={makeVirtualAnchor(hint.anchor)}
      placement="top"
      modifiers={[
        { name: 'offset', options: { offset: [0, 8] } },
        { name: 'preventOverflow', options: { padding: 8 } },
      ]}
      sx={{ zIndex: (t) => t.zIndex.tooltip }}
      keepMounted
    >
      <Paper
        elevation={6}
        sx={{
          px: 1,
          py: 0.5,
          borderRadius: 1.25,
          bgcolor: (t) => alpha(t.palette.grey[900], 0.9),
          color: '#fff',
          fontSize: '0.75rem',
          pointerEvents: 'none',
        }}
      >
        <Typography variant="caption" sx={{ color: 'inherit' }}>
          {hint.text}
        </Typography>
      </Paper>
    </Popper>
  );
}

function TMGraph() {
  const theme = useTheme();

  const states = useGlobalZustand((s) => s.states);
  const transitions = useGlobalZustand((s) => s.transitions);
  const startState = useGlobalZustand((s) => s.startState);
  const currentState = useGlobalZustand((s) => s.currentState);
  const lastState = useGlobalZustand((s) => s.lastState);
  const lastTransition = useGlobalZustand((s) => s.lastTransition);
  const lastTransitionTrigger = useGlobalZustand((s) => s.lastTransitionTrigger);
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);
  const runSpeedMs = useGlobalZustand((s) => s.runSpeedMs);
  const runChoiceHighlightedTMEdges = useGlobalZustand(
    (s) => s.runChoiceHighlightedTMEdges
  );

  const tmGraphELKSettings = useTMGraphELKSettings();
  const setTMGraphELKSettings = useGraphZustand((s) => s.setTMGraphELKSettings);
  const setTMGraphLayoutSnapshot = useGraphZustand((s) => s.setTMGraphLayoutSnapshot);

  const { highlightedEdgeId, setHighlightedEdgeId, selected, setSelected } = useGraphUI();

  const initialSnapshotRef = useRef<TMGraphLayoutSnapshot | null>(
    useGraphZustand.getState().tmGraphLayoutSnapshot
  );

  const {
    nodes,
    edges,
    setNodes,
    topoKey,
    expectedNodeKey,
    expectedEdgeKey,
    restoredSnapshot,
  } = useTMGraphData({
    states,
    transitions,
    startState,
    currentState,
    lastState,
    machineLoadVersion,
    snapshot: initialSnapshotRef.current,
  });

  useHighlightedTransition({
    lastState,
    lastTransition,
    transitions,
    lastTransitionTrigger,
    runSpeedMs,
    setHighlightedEdgeId,
  });

  const cyRef = useRef<CyCore | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef(nodes);
  const topoKeyRef = useRef(topoKey);
  const edgeTooltipRef = useRef<EdgeTooltipState>({
    id: null,
    anchor: null,
    reason: null,
  });
  const nodeHintRef = useRef<NodeHintState>({ id: null, text: null, anchor: null });

  const edgeMapRef = useRef<Map<string, TMGraphEdge>>(new Map());
  const nodeMapRef = useRef<Map<string, TMGraphNode>>(new Map());

  const hoverTimerRef = useRef<number | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const suppressEdgeTooltipCloseUntilRef = useRef(0);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [containerVisible, setContainerVisible] = useState(true);
  const [viewportReady, setViewportReady] = useState(false);
  const [cyReady, setCyReady] = useState(false);
  const [edgeTooltip, setEdgeTooltip] = useState<EdgeTooltipState>({
    id: null,
    anchor: null,
    reason: null,
  });
  const [nodeHint, setNodeHint] = useState<NodeHintState>({
    id: null,
    text: null,
    anchor: null,
  });

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    topoKeyRef.current = topoKey;
  }, [topoKey]);

  useEffect(() => {
    edgeTooltipRef.current = edgeTooltip;
  }, [edgeTooltip]);
  useEffect(() => {
    nodeHintRef.current = nodeHint;
  }, [nodeHint]);

  useEffect(() => {
    edgeMapRef.current = new Map(edges.map((e) => [e.id, e]));
  }, [edges]);

  useEffect(() => {
    nodeMapRef.current = new Map(nodes.map((n) => [n.id, n]));
  }, [nodes]);

  const setEdgeTooltipState = useCallback((next: EdgeTooltipState) => {
    edgeTooltipRef.current = next;
    setEdgeTooltip(next);
  }, []);

  const getAnchorFromEvent = useCallback(
    (evt: { renderedPosition?: { x: number; y: number } }): Anchor => {
      const rect = containerRef.current?.getBoundingClientRect();
      const rx = evt.renderedPosition?.x ?? 0;
      const ry = evt.renderedPosition?.y ?? 0;
      return {
        top: (rect?.top ?? 0) + ry,
        left: (rect?.left ?? 0) + rx,
      };
    },
    []
  );

  const getAnchorFromElement = useCallback((id: string): Anchor | null => {
    try {
      const cy = cyRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!cy || !rect) return null;
      const ele = cy.getElementById(id);
      if (!ele || ele.empty()) return null;
      const anyEle = ele as any;
      const pos =
        typeof anyEle.isEdge === 'function' && anyEle.isEdge()
          ? anyEle.renderedMidpoint?.() ?? anyEle.renderedPosition?.()
          : anyEle.renderedPosition?.();
      if (!pos) return null;
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
      return { top: rect.top + pos.y, left: rect.left + pos.x };
    } catch {
      return null;
    }
  }, []);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const refreshSelectedEdgeTooltipAnchor = useCallback(() => {
    const current = edgeTooltipRef.current;
    if (current.reason !== 'select' || !current.id) return;
    const anchor = getAnchorFromElement(current.id);
    if (!anchor) return;
    if (
      current.anchor &&
      Math.abs(current.anchor.top - anchor.top) < 0.5 &&
      Math.abs(current.anchor.left - anchor.left) < 0.5
    ) {
      return;
    }
    setEdgeTooltipState({ ...current, anchor });
  }, [getAnchorFromElement, setEdgeTooltipState]);

  const persistLayoutSnapshot = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (nodesRef.current.length === 0) return;
    if (!topoKeyRef.current) return;

    const positions: TMGraphLayoutSnapshot['positions'] = {};

    cy.nodes().forEach((node) => {
      const pos = node.position();
      positions[node.id()] = { x: pos.x, y: pos.y };
    });

    for (const node of nodesRef.current) {
      if (!positions[node.id]) {
        positions[node.id] = { x: node.position.x, y: node.position.y };
      }
    }

    if (isDegenerateSnapshot(nodesRef.current, positions)) return;

    const pan = cy.pan();
    const zoom = cy.zoom();

    const viewportSnapshot: TMGraphViewportSnapshot = {
      x: pan.x,
      y: pan.y,
      zoom,
    };

    setTMGraphLayoutSnapshot({
      machineLoadVersion,
      topoKey: topoKeyRef.current,
      positions,
      viewport: viewportSnapshot,
    });
  }, [machineLoadVersion, setTMGraphLayoutSnapshot]);

  const schedulePersistLayoutSnapshot = useCallback(() => {
    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      persistLayoutSnapshot();
    }, 180);
  }, [persistLayoutSnapshot]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current != null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      persistLayoutSnapshot();
    };
  }, [persistLayoutSnapshot]);

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

  const runFitView = useCallback(
    (onDone?: () => void) => {
      const cy = cyRef.current;
      if (!cy) return;

      requestAnimationFrame(() => {
        cy.resize();

        if (cy.elements().length > 0) {
          cy.fit(cy.elements(), 30);
        }

        schedulePersistLayoutSnapshot();
        onDone?.();
      });
    },
    [schedulePersistLayoutSnapshot]
  );

  const isContainerVisible = useCallback(() => {
    const el = containerRef.current;
    return !!el && el.clientWidth > 0 && el.clientHeight > 0;
  }, []);

  useEffect(() => {
    setContainerVisible(isContainerVisible());
  }, [isContainerVisible]);

  const cyStyles = useMemo(() => getCyStyles(theme), [theme]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cy = cytoscape({
      container,
      elements: [],
      style: cyStyles,
      minZoom: 0.01,
      maxZoom: 2.5,
    });

    cy.boxSelectionEnabled(false);
    cy.userPanningEnabled(true);
    cy.userZoomingEnabled(true);
    cy.autoungrabify(false);
    cy.zoom(1);
    cy.center();

    const onPaneTap = (evt: EventObject) => {
      if (evt.target !== cy) return;
      setSelected({ type: null, id: null });
      setSettingsOpen(false);
      setEdgeTooltipState({ id: null, anchor: null, reason: null });
      setNodeHint({ id: null, text: null, anchor: null });
    };

    const onNodeTap = (evt: EventObjectNode) => {
      evt.stopPropagation();
      const anchor = getAnchorFromEvent(evt);
      setSelected({ type: 'node', id: evt.target.id(), anchor });
      setEdgeTooltipState({ id: null, anchor: null, reason: null });
    };

    const onEdgeTap = (evt: EventObjectEdge) => {
      evt.stopPropagation();
      clearHoverTimer();

      const id = evt.target.id();
      const source = String(evt.target.data('source') ?? '');
      const target = String(evt.target.data('target') ?? '');

      if (handleTMGraphRunChoiceEdgeClick(source, target)) {
        setSelected({ type: null, id: null });
        setEdgeTooltipState({ id: null, anchor: null, reason: null });
        return;
      }

      const anchor = getAnchorFromEvent(evt);
      setSelected({ type: 'edge', id, anchor });
      suppressEdgeTooltipCloseUntilRef.current = Date.now() + 180;
      const next: EdgeTooltipState = { id, anchor, reason: 'select' };
      setEdgeTooltipState(next);
    };

    const onEdgeMouseOver = (evt: EventObjectEdge) => {
      const id = evt.target.id();
      evt.target.addClass('hovered');
      clearHoverTimer();

      if (edgeTooltipRef.current.reason === 'select') return;

      const anchor = getAnchorFromEvent(evt);
      hoverTimerRef.current = window.setTimeout(() => {
        setEdgeTooltipState({ id, anchor, reason: 'hover' });
      }, HOVER_POPPER_DELAY_MS);
    };

    const onEdgeMouseMove = (evt: EventObjectEdge) => {
      const current = edgeTooltipRef.current;
      if (current.reason !== 'hover' || current.id !== evt.target.id()) return;

      const base = getAnchorFromEvent(evt);
      setEdgeTooltipState({
        id: current.id,
        anchor: { top: base.top + 8, left: base.left + 8 },
        reason: 'hover',
      });
    };

    const onEdgeMouseOut = (evt: EventObjectEdge) => {
      evt.target.removeClass('hovered');
      clearHoverTimer();
      const current = edgeTooltipRef.current;
      if (current.reason === 'hover' && current.id === evt.target.id()) {
        setEdgeTooltipState({ id: null, anchor: null, reason: null });
      }
    };

    const onNodeMouseOver = (evt: EventObjectNode) => {
      const text = String(evt.target.data('rolesText') ?? '');
      if (!text) return;
      const anchor = getAnchorFromEvent(evt);
      setNodeHint({ id: evt.target.id(), text, anchor });
    };

    const onNodeMouseMove = (evt: EventObjectNode) => {
      const current = evt.target.id();
      if (nodeHintRef.current.id !== current) return;
      const anchor = getAnchorFromEvent(evt);
      setNodeHint((prev) => ({ ...prev, anchor }));
    };

    const onNodeMouseOut = (evt: EventObjectNode) => {
      if (nodeHintRef.current.id !== evt.target.id()) return;
      setNodeHint({ id: null, text: null, anchor: null });
    };

    const onViewportChanged = () => {
      refreshSelectedEdgeTooltipAnchor();
      schedulePersistLayoutSnapshot();
    };

    const onNodeDragFree = (evt: EventObjectNode) => {
      const id = evt.target.id();
      const pos = evt.target.position();

      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== id) return node;
          const same = node.position.x === pos.x && node.position.y === pos.y;
          return same ? node : { ...node, position: { x: pos.x, y: pos.y } };
        })
      );

      schedulePersistLayoutSnapshot();
    };

    cy.on('tap', onPaneTap);
    cy.on('tap', 'node', onNodeTap);
    cy.on('tap', 'edge', onEdgeTap);
    cy.on('mouseover', 'edge', onEdgeMouseOver);
    cy.on('mousemove', 'edge', onEdgeMouseMove);
    cy.on('mouseout', 'edge', onEdgeMouseOut);
    cy.on('mouseover', 'node', onNodeMouseOver);
    cy.on('mousemove', 'node', onNodeMouseMove);
    cy.on('mouseout', 'node', onNodeMouseOut);
    cy.on('dragfree', 'node', onNodeDragFree);
    cy.on('pan zoom', onViewportChanged);

    cyRef.current = cy;
    setCyReady(true);

    return () => {
      clearHoverTimer();
      cy.off('tap', onPaneTap);
      cy.off('tap', 'node', onNodeTap);
      cy.off('tap', 'edge', onEdgeTap);
      cy.off('mouseover', 'edge', onEdgeMouseOver);
      cy.off('mousemove', 'edge', onEdgeMouseMove);
      cy.off('mouseout', 'edge', onEdgeMouseOut);
      cy.off('mouseover', 'node', onNodeMouseOver);
      cy.off('mousemove', 'node', onNodeMouseMove);
      cy.off('mouseout', 'node', onNodeMouseOut);
      cy.off('dragfree', 'node', onNodeDragFree);
      cy.off('pan zoom', onViewportChanged);
      setCyReady(false);
      cy.destroy();
      cyRef.current = null;
    };
  }, [
    clearHoverTimer,
    cyStyles,
    getAnchorFromEvent,
    refreshSelectedEdgeTooltipAnchor,
    setEdgeTooltipState,
    schedulePersistLayoutSnapshot,
    setSelected,
    setNodes,
  ]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style(cyStyles);
    cy.style().update();
  }, [cyStyles]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const nextIds = new Set<string>([
      ...nodes.map((n) => n.id),
      ...edges.map((e) => e.id),
    ]);

    cy.batch(() => {
      cy.elements().forEach((ele) => {
        if (!nextIds.has(ele.id())) ele.remove();
      });

      nodes.forEach((n) => {
        const data = (n.data ?? {}) as any;
        const label = String(data.label ?? n.id);
        const isStart = Boolean(data.isStart);
        const isCurrent = Boolean(data.isCurrent);
        const isLast = Boolean(data.isLast);

        const roles = getNodeRoles(label, isStart, isCurrent, isLast);

        const borderColor = isCurrent
          ? normalizeColor(theme.palette.primary.main)
          : isLast
            ? normalizeColor(theme.palette.accent.light)
            : normalizeColor(theme.palette.border.main);

        const isAccepting = ['done', 'accept', 'accepted'].includes(label.toLowerCase());
        const isRejecting = ['error', 'reject', 'rejected'].includes(label.toLowerCase());

        const bgColor =
          isCurrent || isLast
            ? normalizeColor(theme.palette.background.paper)
            : isAccepting
              ? normalizeColor(theme.palette.success.light)
              : isRejecting
                ? normalizeColor(theme.palette.error.light)
                : normalizeColor(theme.palette.background.paper);

        const classes = ['node'];
        if (isStart) classes.push('start');
        if (isCurrent) classes.push('current');
        if (isLast) classes.push('last');

        const cyData = {
          id: n.id,
          label,
          rolesText: roles.join(' · '),
          bgColor,
          borderColor,
          borderWidth: 3,
          width: n.width ?? STATE_NODE_DIAMETER,
          height: n.height ?? STATE_NODE_DIAMETER,
        };

        const position = n.position ?? { x: 0, y: 0 };
        const ele = cy.getElementById(n.id);

        if (ele && ele.length > 0) {
          ele.data(cyData);
          ele.position(position);
          ele.classes(classes.join(' '));
        } else {
          cy.add({
            group: 'nodes',
            data: cyData,
            position,
            classes: classes.join(' '),
          });
        }
      });

      edges.forEach((e) => {
        const data = (e.data ?? {}) as any;
        const isLoop = e.source === e.target;
        const bended = data.bended === true;

        const classes = ['edge'];
        if (isLoop) classes.push('loop');
        if (bended) classes.push('bended');

        const cyData = {
          id: e.id,
          source: e.source,
          target: e.target,
          label: typeof e.label === 'string' ? e.label : '',
          transitions: (data.transitions as Transition[] | undefined) ?? [],
          // Use one positive distance for both directions: Cytoscape flips side for reverse direction.
          curveDistance: bended ? 34 : 0,
        };

        const ele = cy.getElementById(e.id);

        if (ele && ele.length > 0) {
          ele.data(cyData);
          ele.classes(classes.join(' '));
        } else {
          cy.add({
            group: 'edges',
            data: cyData,
            classes: classes.join(' '),
          });
        }
      });
    });

  }, [nodes, edges, theme]);

  const currentNodeKey = useMemo(
    () => nodes.map((n) => n.id).sort((a, b) => a.localeCompare(b)).join('|'),
    [nodes]
  );
  const currentEdgeKey = useMemo(
    () => edges.map((e) => e.id).sort((a, b) => a.localeCompare(b)).join('|'),
    [edges]
  );

  const lastSelectedEdgeRef = useRef<string | null>(null);
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const next = selected.type === 'edge' ? selected.id : null;
    const prev = lastSelectedEdgeRef.current;
    if (prev === next) return;

    cy.batch(() => {
      if (prev) cy.getElementById(prev).removeClass('ct-selected');
      if (next) cy.getElementById(next).addClass('ct-selected');
    });

    lastSelectedEdgeRef.current = next;
  }, [selected]);

  const lastHighlightedSetRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const nextSet = new Set<string>(runChoiceHighlightedTMEdges);
    if (highlightedEdgeId) nextSet.add(highlightedEdgeId);

    const prevSet = lastHighlightedSetRef.current;

    cy.batch(() => {
      prevSet.forEach((id) => {
        if (!nextSet.has(id)) cy.getElementById(id).removeClass('tm-highlighted');
      });

      nextSet.forEach((id) => {
        if (!prevSet.has(id)) cy.getElementById(id).addClass('tm-highlighted');
      });
    });

    lastHighlightedSetRef.current = nextSet;
  }, [highlightedEdgeId, runChoiceHighlightedTMEdges]);

  const didInitialLayoutRef = useRef(false);
  const lastTopoKeyRef = useRef<string | null>(null);
  const lastHandledMachineLoadRef = useRef<number>(machineLoadVersion);
  const fitAfterLayoutRef = useRef(false);
  const prevRunningRef = useRef(layout.running);
  const restoredViewportAppliedRef = useRef(false);
  const structureReadyForLayout =
    nodes.length > 0 &&
    expectedNodeKey.length > 0 &&
    currentNodeKey === expectedNodeKey &&
    currentEdgeKey === expectedEdgeKey;

  useEffect(() => {
    if (nodes.length === 0) {
      setViewportReady(true);
      return;
    }
    if (!structureReadyForLayout) {
      setViewportReady(false);
      return;
    }

    if (!didInitialLayoutRef.current) {
      didInitialLayoutRef.current = true;
      lastTopoKeyRef.current = topoKey;

      if (restoredSnapshot) {
        setViewportReady(false);
        return;
      }

      setViewportReady(false);
      scheduleLayoutRestart();
      fitAfterLayoutRef.current = true;
      return;
    }

    if (lastTopoKeyRef.current === topoKey) return;

    lastTopoKeyRef.current = topoKey;
    restoredViewportAppliedRef.current = false;
    setViewportReady(false);
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [nodes.length, topoKey, restoredSnapshot, scheduleLayoutRestart, structureReadyForLayout]);

  useEffect(() => {
    if (nodes.length === 0) return;
    if (!structureReadyForLayout) return;
    if (lastHandledMachineLoadRef.current === machineLoadVersion) return;

    lastHandledMachineLoadRef.current = machineLoadVersion;
    restoredViewportAppliedRef.current = false;
    setViewportReady(false);
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [machineLoadVersion, nodes.length, scheduleLayoutRestart, structureReadyForLayout]);

  useEffect(() => {
    const justFinished = prevRunningRef.current && !layout.running;
    if (justFinished) {
      if (fitAfterLayoutRef.current && nodes.length > 0) {
        fitAfterLayoutRef.current = false;
        runFitView(() => {
          setViewportReady(true);
        });
      }

      schedulePersistLayoutSnapshot();
    }

    prevRunningRef.current = layout.running;
  }, [layout.running, nodes.length, runFitView, schedulePersistLayoutSnapshot]);

  useEffect(() => {
    if (restoredViewportAppliedRef.current) return;

    const viewport = restoredSnapshot?.viewport;
    const cy = cyRef.current;

    if (!viewport || !cy || !cyReady || nodes.length === 0) return;

    restoredViewportAppliedRef.current = true;

    requestAnimationFrame(() => {
      cy.viewport({
        zoom: viewport.zoom,
        pan: { x: viewport.x, y: viewport.y },
      });

      setViewportReady(true);
    });
  }, [restoredSnapshot, nodes.length, cyReady]);

  useEffect(() => {
    const cy = cyRef.current;
    const el = containerRef.current;
    if (!cy || !el || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(() => {
      const visible = isContainerVisible();
      setContainerVisible(visible);
      cy.resize();

      if (visible) {
        refreshSelectedEdgeTooltipAnchor();
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [isContainerVisible, refreshSelectedEdgeTooltipAnchor]);

  const refreshViewportAfterSwitch = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;

    requestAnimationFrame(() => {
      cy.resize();
      refreshSelectedEdgeTooltipAnchor();
      schedulePersistLayoutSnapshot();
    });
  }, [refreshSelectedEdgeTooltipAnchor, schedulePersistLayoutSnapshot]);

  useEffect(() => {
    const handler: EventListener = (event) => {
      const detail = (event as CustomEvent<PortalBridgeSwitchDetail>).detail;
      if (!detail || detail.id !== 'tmGraph') return;
      refreshViewportAfterSwitch();
    };

    window.addEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    return () => {
      window.removeEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    };
  }, [refreshViewportAfterSwitch]);

  useEffect(() => {
    let rafId: number | null = null;
    const scheduleRefresh = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        refreshSelectedEdgeTooltipAnchor();
      });
    };

    window.addEventListener('scroll', scheduleRefresh, true);
    window.addEventListener('resize', scheduleRefresh);
    return () => {
      window.removeEventListener('scroll', scheduleRefresh, true);
      window.removeEventListener('resize', scheduleRefresh);
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [refreshSelectedEdgeTooltipAnchor]);

  const recalcLayout = useCallback(() => {
    setViewportReady(false);
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [scheduleLayoutRestart]);

  const resetToDefaults = useCallback(() => {
    setTMGraphELKSettings({ ...DEFAULT_ELK_OPTS, direction: 'RIGHT' });
  }, [setTMGraphELKSettings]);

  const edgeTransitions = edgeTooltip.id
    ? ((edgeMapRef.current.get(edgeTooltip.id)?.data as any)?.transitions as
        | Transition[]
        | undefined) ?? []
    : [];

  const fallbackLines = useMemo(() => {
    if (!edgeTooltip.id) return [] as string[];
    if (edgeTransitions.length > 0) return [];
    const label = edgeMapRef.current.get(edgeTooltip.id)?.label;
    if (typeof label !== 'string' || !label.trim()) return [];
    return label.split('\n').map((s) => s.trim());
  }, [edgeTooltip.id, edgeTransitions]);

  const sourceLabel = edgeTooltip.id
    ? String(edgeMapRef.current.get(edgeTooltip.id)?.source ?? '')
    : '';
  const targetLabel = edgeTooltip.id
    ? String(edgeMapRef.current.get(edgeTooltip.id)?.target ?? '')
    : '';

  const zoomBy = useCallback((factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;

    const next = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor));
    cy.zoom({
      level: next,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  }, []);

  const handleEdgeTooltipClose = useCallback(() => {
    if (edgeTooltipRef.current.reason === 'select') return;
    if (Date.now() < suppressEdgeTooltipCloseUntilRef.current) return;
    setSelected({ type: null, id: null });
    setEdgeTooltipState({ id: null, anchor: null, reason: null });
  }, [setSelected, setEdgeTooltipState]);

  return (
    <Box
      id="TMGraph"
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 360,
        overflow: 'hidden',
        backgroundImage: (t) =>
          `radial-gradient(circle, ${alpha(t.palette.common.black, 0.12)} 1px, transparent 1px)`,
        backgroundSize: '10px 10px',
      }}
    >
      <Box
        ref={containerRef}
        sx={{
          position: 'absolute',
          inset: 0,
          opacity: viewportReady ? 1 : 0,
          pointerEvents: viewportReady ? 'auto' : 'none',
          transition: 'opacity 120ms ease',
        }}
      />

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
            onClick={(evt) => {
              evt.stopPropagation();
              setSettingsOpen((v) => !v);
            }}
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
          <Button
            size="small"
            variant="contained"
            onClick={(evt) => {
              evt.stopPropagation();
              recalcLayout();
            }}
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
      </Box>

      <Paper
        elevation={3}
        sx={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          zIndex: (t) => t.zIndex.appBar + 1,
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 1,
          overflow: 'hidden',
          border: (t) => `1px solid ${alpha(t.palette.divider, 0.55)}`,
        }}
        onClick={(evt) => evt.stopPropagation()}
      >
        <IconButton size="small" onClick={() => zoomBy(1.2)}>
          <Add fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => zoomBy(1 / 1.2)}>
          <Remove fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => runFitView()}>
          <CenterFocusStrong fontSize="small" />
        </IconButton>
      </Paper>

      <NodeHintPopper hint={nodeHint} open={containerVisible && !!nodeHint.text} />

      <EdgeTooltip
        open={containerVisible && !!edgeTooltip.id && !!edgeTooltip.anchor}
        anchorEl={makeVirtualAnchor(edgeTooltip.anchor)}
        edgeId={edgeTooltip.id ?? ''}
        source={sourceLabel}
        target={targetLabel}
        transitions={edgeTransitions}
        fallbackLines={fallbackLines}
        onClose={handleEdgeTooltipClose}
      />
    </Box>
  );
}

export function TMGraphWrapper() {
  return (
    <GraphUIProvider>
      <TMGraph />
    </GraphUIProvider>
  );
}
