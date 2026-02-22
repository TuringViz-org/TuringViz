// src/components/ComputationTree/ComputationTree.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cytoscape, {
  type Core as CyCore,
  type EventObjectEdge,
  type EventObjectNode,
  type Stylesheet,
} from 'cytoscape';
import {
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  MarkerType,
  Background,
} from '@xyflow/react';
import {
  Stack,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Box,
  Fab,
  Paper,
  Popper,
  ClickAwayListener,
  IconButton,
} from '@mui/material';
import { Cached, Adjust, ViewAgenda, Tune, CenterFocusStrong } from '@mui/icons-material';
import { alpha, useTheme } from '@mui/material/styles';
import type { VirtualElement } from '@popperjs/core';
import { toast } from 'sonner';
import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';

import { LegendPanel } from '@components/shared/LegendPanel';
import ConfigCard from '@components/ConfigGraph/ConfigVisualization/ConfigCard';
import { EdgeTooltip } from '@components/ConfigGraph/edges/EdgeTooltip';
import { ConfigNode } from '@components/ConfigGraph/nodes/ConfigNode';
import { ConfigCardNode } from '@components/ConfigGraph/nodes/ConfigCardNode';
import { FloatingEdge } from '@components/ConfigGraph/edges/FloatingEdge';

import {
  CONFIG_CARD_HEIGHT_ESTIMATE,
  CONFIG_CARD_WIDTH,
  CONFIG_NODE_DIAMETER,
  CONTROL_HEIGHT,
  CARDS_LIMIT,
  NodeType,
  EdgeType,
} from './util/constants';
import { COLOR_STATE_SWITCH } from '../ConfigGraph/util/constants';
import {
  getComputationTreeFromInputs,
  type ComputationTree as ComputationTreeModel,
} from '@tmfunctions/ComputationTree';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  useComputationTreeNodeMode,
  useComputationTreeELKSettings,
  useGraphZustand,
} from '@zustands/GraphZustand';
import { buildComputationTreeGraph } from './util/buildComputationTree';
import {
  CARDS_CONFIRM_THRESHOLD,
  ConfigNodeMode,
  DEFAULT_ELK_OPTS,
  HOVER_POPPER_DELAY_MS,
} from '@utils/constants';
import { useElkLayout } from './layout/useElkLayout';
import { TreeLayoutSettingsPanel } from './layout/LayoutSettingsPanel';
import { useDebouncedLayoutRestart } from '@hooks/useDebouncedLayoutRestart';
import { GraphUIProvider, useGraphUI } from '@components/shared/GraphUIContext';
import {
  PORTAL_BRIDGE_SWITCH_EVENT,
  type PortalBridgeSwitchDetail,
} from '@components/MainPage/PortalBridge';
import { reconcileEdges, reconcileNodes } from '@utils/reactflow';
import { setConfiguration } from '@tmfunctions/Running';
import {
  getPointerSnapshot,
  subscribePointerTracker,
  type PointerSnapshot,
} from '@components/shared/pointerTracker';
import { getStartConfiguration } from '@tmfunctions/Configurations';
import { computeComputationTreeInWorker } from '@utils/graphWorkerClient';
import {
  GRAPH_EDGE_ACTIVE_WIDTH,
  GRAPH_EDGE_ARROW_SCALE,
  GRAPH_EDGE_BASE_WIDTH,
  GRAPH_EDGE_COMPRESSED_WIDTH,
  GRAPH_EDGE_HOVER_WIDTH,
} from '@components/shared/edgeVisualConstants';

type Anchor = { top: number; left: number };

type NodePopperState = {
  id: string | null;
  anchor: Anchor | null;
  reason: 'hover' | 'select' | null;
};

type EdgeTooltipState = {
  id: string | null;
  anchor: Anchor | null;
  reason: 'hover' | 'select' | null;
};

type ViewportSnapshot = {
  zoom: number;
  pan: { x: number; y: number };
};

const rfNodeTypes = {
  [NodeType.CONFIG]: ConfigNode,
  [NodeType.CONFIG_CARD]: ConfigCardNode,
};
const rfEdgeTypes = {
  [EdgeType.FLOATING]: FloatingEdge,
};
const rfDefaultEdgeOptions = {
  type: EdgeType.FLOATING,
  markerEnd: {
    type: MarkerType.ArrowClosed,
  },
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

const acceptingStates = ['accept', 'accepted', 'done'];
const rejectingStates = ['reject', 'rejected', 'error'];

const normalizeColor = (color?: string) => {
  if (!color) return undefined;
  // Convert 8-digit hex (#RRGGBBAA) to rgba() because Cytoscape can be picky.
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
  if (direct) return normalizeColor(direct);
  const lower = key.toLowerCase();
  if (acceptingStates.includes(lower)) return 'accept'; // sentinel
  if (rejectingStates.includes(lower)) return 'reject'; // sentinel
  return undefined;
};

function getCyStyles(theme: ReturnType<typeof useTheme>): Stylesheet[] {
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
        width: 'data(width)',
        height: 'data(height)',
        label: 'data(displayLabel)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 14,
        'font-weight': 600,
        color: theme.palette.text.primary,
        'text-outline-width': 2,
        'text-outline-color': 'data(textOutline)',
        'background-color': 'data(bgColor)',
        'border-width': 'data(borderWidth)',
        'border-color': 'data(borderColor)',
        'border-style': 'solid',
        shape: 'ellipse',
        'z-index': 5,
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'node.card',
      style: {
        shape: 'round-rectangle',
      },
    },
    {
      selector: 'node.start',
      style: {
        'border-color': theme.palette.primary.main,
        'border-width': 8,
      },
    },
    {
      selector: 'node.hovered',
      style: {
        'border-color': theme.palette.border?.dark ?? theme.palette.primary.dark,
        'border-width': 8,
      },
    },
    {
      selector: 'node.ct-selected',
      style: {
        'border-color': theme.palette.primary.dark,
        'border-width': 9,
        'box-shadow': `0 0 0 6px ${alpha(theme.palette.primary.main, 0.25)}`,
      },
    },
    {
      selector: 'node.hidden-label',
      style: { label: '' },
    },
    {
      selector: 'edge',
      style: {
        width: GRAPH_EDGE_BASE_WIDTH,
        'line-color': theme.palette.grey[500],
        'target-arrow-color': theme.palette.grey[500],
        'target-arrow-shape': 'triangle',
        'arrow-scale': GRAPH_EDGE_ARROW_SCALE,
        'curve-style': 'straight',
        'line-opacity': 0.9,
        label: 'data(label)',
        'font-size': 12,
        'text-rotation': 'autorotate',
        'text-margin-y': -6,
        'text-outline-width': 2,
        'text-outline-color': theme.palette.background.paper,
      },
    },
    {
      selector: 'edge.compressed',
      style: {
        'line-style': 'dashed',
        width: GRAPH_EDGE_COMPRESSED_WIDTH,
        'line-dash-pattern': [6, 4],
      },
    },
    {
      selector: 'edge.hovered',
      style: {
        width: GRAPH_EDGE_HOVER_WIDTH,
        'line-color': theme.palette.grey[700],
        'target-arrow-color': theme.palette.grey[700],
      },
    },
    {
      selector: 'edge.ct-selected',
      style: {
        width: GRAPH_EDGE_ACTIVE_WIDTH,
        'line-color': theme.palette.primary.dark,
        'target-arrow-color': theme.palette.primary.dark,
      },
    },
    {
      selector: 'edge.hidden-label',
      style: { label: '' },
    },
  ];
}

function NodeDetailPopper({
  node,
  anchor,
  open,
  onClose,
}: {
  node: RFNode | null;
  anchor: Anchor | null;
  open: boolean;
  onClose: () => void;
}) {
  const virtualAnchor = useMemo(() => makeVirtualAnchor(anchor), [anchor]);
  const data = (node?.data ?? {}) as any;
  if (!node || !anchor) return null;

  return (
    <Popper
      open={open}
      anchorEl={virtualAnchor}
      placement="top-start"
      modifiers={[
        { name: 'offset', options: { offset: [0, 10] } },
        { name: 'preventOverflow', options: { padding: 8 } },
      ]}
      sx={{ zIndex: (t) => t.zIndex.tooltip }}
    >
      <ClickAwayListener
        onClickAway={onClose}
        mouseEvent={false}
        touchEvent={false}
      >
        <Paper
          elevation={6}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          sx={{
            p: 1,
            borderRadius: 2,
            bgcolor: (t) => alpha(t.palette.background.paper, 0.97),
            backdropFilter: 'blur(6px)',
            border: (t) => `1px solid ${alpha(t.palette.divider, 0.32)}`,
            boxShadow: (t) =>
              `0 8px 28px ${alpha(t.palette.common.black, 0.18)}, 0 1px 2px ${alpha(
                t.palette.common.black,
                0.08
              )}`,
          }}
        >
          <ConfigCard
            config={data.config}
            cardWidth={CONFIG_CARD_WIDTH}
            computed={data.isComputed}
            showSelect={false}
            onSelect={() => setConfiguration(data.config)}
            pendingInteractive={false}
          />
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}

function useComputationTreeData(
  targetNodes: number,
  compressing: boolean,
  nodeMode: ConfigNodeMode
): {
  model: ComputationTreeModel | null;
  base: ReturnType<typeof buildComputationTreeGraph>;
} {
  const transitions = useGlobalZustand((s) => s.transitions);
  const blank = useGlobalZustand((s) => s.blank);
  const startState = useGlobalZustand((s) => s.startState);
  const numberOfTapes = useGlobalZustand((s) => s.numberOfTapes);
  const input = useGlobalZustand((s) => s.input);

  const [model, setModel] = useState<ComputationTreeModel | null>(null);
  const [base, setBase] = useState<ReturnType<typeof buildComputationTreeGraph>>({
    nodes: [],
    edges: [],
    topoKey: '',
  });
  const requestRef = useRef(0);

  useEffect(() => {
    const startConfig = getStartConfiguration();
    const reqId = requestRef.current + 1;
    requestRef.current = reqId;

    computeComputationTreeInWorker({
      depth: targetNodes,
      targetNodes,
      compressing,
      transitions,
      numberOfTapes,
      blank,
      startConfig,
    })
      .then((tree) => {
        if (requestRef.current !== reqId) return;
        setModel(tree);
      })
      .catch(() => {
        if (requestRef.current !== reqId) return;
        const tree = getComputationTreeFromInputs(
          startConfig,
          transitions,
          numberOfTapes,
          blank,
          targetNodes,
          compressing,
          (msg) => toast.warning(msg),
          targetNodes
        );
        setModel(tree);
      });
  }, [targetNodes, compressing, transitions, blank, numberOfTapes, startState, input]);

  useEffect(() => {
    if (!model) return;
    setBase(buildComputationTreeGraph(model, transitions, nodeMode));
  }, [model, transitions, nodeMode]);

  return { model, base };
}

type Props = { targetNodes: number; compressing?: boolean };

function ComputationTreeCircles({ targetNodes, compressing = false }: Props) {
  const theme = useTheme();
  const cyRef = useRef<CyCore | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ViewportSnapshot | null>(null);

  // Global Zustand state
  const transitions = useGlobalZustand((s) => s.transitions);
  const stateColorMatching = useGlobalZustand((s) => s.stateColorMatching);
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);

  // Graph Zustand state and setters
  const computationTreeNodeMode = useComputationTreeNodeMode();
  const setComputationTreeNodeMode = useGraphZustand(
    (s) => s.setComputationTreeNodeMode
  );
  const computationTreeELKSettings = useComputationTreeELKSettings();
  const setComputationTreeELKSettings = useGraphZustand(
    (s) => s.setComputationTreeELKSettings
  );

  const { selected, setSelected, hoveredState, setHoveredState } = useGraphUI();

  // Base graph structure (nodes/edges) extraction
  const { model, base } = useComputationTreeData(
    targetNodes,
    !!compressing,
    computationTreeNodeMode
  );

  const [nodes, setNodes] = useState<RFNode[]>(base.nodes);
  const [edges, setEdges] = useState<RFEdge[]>(base.edges);
  const [structureKey, setStructureKey] = useState('');
  const [containerVisible, setContainerVisible] = useState(true);
  const [viewportReady, setViewportReady] = useState(false);

  // Keep node/edge lookup maps for quick access in event handlers
  const nodeMapRef = useRef<Map<string, RFNode>>(new Map());
  const edgeMapRef = useRef<Map<string, RFEdge>>(new Map());

  useEffect(() => {
    nodeMapRef.current = new Map(nodes.map((n) => [n.id, n]));
  }, [nodes]);
  useEffect(() => {
    edgeMapRef.current = new Map(edges.map((e) => [e.id, e]));
  }, [edges]);

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
    topoKeyOverride: structureKey,
    autoRun: false,
    onLayout: (positions) => {
      setNodes((prev) =>
        prev.map((n) => {
          const p = positions.get(n.id);
          if (!p) return n;
          const same = n.position?.x === p.x && n.position?.y === p.y;
          return same ? n : { ...n, position: p };
        })
      );
    },
  });
  const scheduleLayoutRestart = useDebouncedLayoutRestart(layout);

  // Adjust edgeNodeSep when node mode changes
  useEffect(() => {
    const edgeNodeSepTarget =
      computationTreeNodeMode === ConfigNodeMode.CARDS ? 300 : 100;
    if (computationTreeELKSettings.edgeNodeSep === edgeNodeSepTarget) return;
    setComputationTreeELKSettings({ edgeNodeSep: edgeNodeSepTarget });
  }, [
    computationTreeNodeMode,
    computationTreeELKSettings.edgeNodeSep,
    setComputationTreeELKSettings,
  ]);

  // Performance + layout tracking
  const didInitialLayoutRef = useRef(false);
  const lastTopoKeyRef = useRef<string | null>(null);
  const fitAfterLayoutRef = useRef(false);
  const prevRunningRef = useRef(layout.running);
  const pendingMachineLoadFitRef = useRef(false);
  const awaitingInitialRevealRef = useRef(false);
  const lastHandledMachineLoadRef = useRef<number>(-1);
  useEffect(() => {
    if (nodes.length === 0) setViewportReady(false);
  }, [nodes.length]);

  // Disable cards mode if too many nodes
  const nodeCount = model?.nodes?.length ?? 0;
  const cardsDisabled = nodeCount > CARDS_LIMIT;

  useEffect(() => {
    if (computationTreeNodeMode === ConfigNodeMode.CARDS && cardsDisabled) {
      setComputationTreeNodeMode(ConfigNodeMode.CIRCLES);
      toast.warning(
        `Cards are disabled when there are more than ${CARDS_LIMIT} nodes (current: ${nodeCount}).`
      );
    }
  }, [
    cardsDisabled,
    computationTreeNodeMode,
    nodeCount,
    setComputationTreeNodeMode,
  ]);

  // If too many nodes, hide labels and only show colors
  const hideLabels = nodeCount >= COLOR_STATE_SWITCH;

  // Sync builder output into state; keep previous size/data; ELK will set positions afterwards
  useEffect(() => {
    if (!model) return;

    setNodes((prev) =>
      reconcileNodes(prev, base.nodes, (node) => {
        const stateName = (node.data as any)?.config?.state;
        const mappedColor = resolveColorForState(stateName);

        return {
          ...(node.data as any),
          showLabel: !hideLabels,
          stateColor: mappedColor,
        };
      })
    );

    setEdges((prev) => reconcileEdges(prev, base.edges));
    setStructureKey((prev) => (prev === base.topoKey ? prev : base.topoKey));
  }, [
    model,
    base.nodes,
    base.edges,
    base.topoKey,
    hideLabels,
    stateColorMatching,
    setNodes,
    setEdges,
  ]);

  // Start ELK once when nodes are ready
  useEffect(() => {
    if (!didInitialLayoutRef.current && nodes.length > 0) {
      didInitialLayoutRef.current = true;
      awaitingInitialRevealRef.current = true;
      setViewportReady(false);
      scheduleLayoutRestart();
      fitAfterLayoutRef.current = true;
    }
  }, [nodes.length, scheduleLayoutRestart]);

  // Start ELK on structural changes
  useEffect(() => {
    if (nodes.length === 0) return;
    if (lastTopoKeyRef.current === null) {
      lastTopoKeyRef.current = structureKey;
      return;
    }
    if (lastTopoKeyRef.current === structureKey) return;
    lastTopoKeyRef.current = structureKey;

    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [structureKey, nodes.length, scheduleLayoutRestart]);

  // Start ELK when nodeMode changes
  useEffect(() => {
    if (nodes.length === 0) return;
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [computationTreeNodeMode, scheduleLayoutRestart, nodes.length]);

  // Fit helper for Cytoscape
  const runFitView = useCallback((onDone?: () => void) => {
    const cy = cyRef.current;
    if (!cy) return;

    requestAnimationFrame(() => {
      cy.resize();
      cy.fit(cy.elements(), 30);
      onDone?.();
    });
  }, []);

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

  useEffect(() => {
    const justFinished = prevRunningRef.current && !layout.running;
    if (justFinished) {
      if (fitAfterLayoutRef.current && nodes.length > 0) {
        fitAfterLayoutRef.current = false;
        runFitView(() => {
          const visibleNow = isContainerVisible();
          if (visibleNow) {
            pendingMachineLoadFitRef.current = false;
          }
          if (visibleNow && awaitingInitialRevealRef.current) {
            awaitingInitialRevealRef.current = false;
            setViewportReady(true);
          }
        });
      }
    }

    prevRunningRef.current = layout.running;
  }, [layout.running, nodes.length, runFitView, isContainerVisible]);

  // Event helpers ------------------------------------------------------------
  const hoverTimerRef = useRef<number | null>(null);
  const nodePopperRef = useRef<NodePopperState>({
    id: null,
    anchor: null,
    reason: null,
  });
  const edgeTooltipRef = useRef<EdgeTooltipState>({
    id: null,
    anchor: null,
    reason: null,
  });

  const pointerStateRef = useRef<PointerSnapshot>(getPointerSnapshot());
  const selectedRef = useRef(selected);
  const settingsOpenRef = useRef(false);
  const lastNonEmptyNodesRef = useRef<RFNode[]>([]);
  const lastNonEmptyEdgesRef = useRef<RFEdge[]>([]);
  const resolveColorForState = useCallback(
    (stateName?: string) => {
      const res = resolveStateColor(stateName, stateColorMatching);
      if (res === 'accept') return normalizeColor(theme.palette.success.light);
      if (res === 'reject') return normalizeColor(theme.palette.error.light);
      return normalizeColor(res);
    },
    [stateColorMatching, theme.palette.error.light, theme.palette.success.light]
  );

  const [nodePopper, setNodePopper] = useState<NodePopperState>({
    id: null,
    anchor: null,
    reason: null,
  });
  const [edgeTooltip, setEdgeTooltip] = useState<EdgeTooltipState>({
    id: null,
    anchor: null,
    reason: null,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    nodePopperRef.current = nodePopper;
  }, [nodePopper]);
  useEffect(() => {
    edgeTooltipRef.current = edgeTooltip;
  }, [edgeTooltip]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);
  useEffect(() => {
    pointerStateRef.current = getPointerSnapshot();
    const unsubscribe = subscribePointerTracker(() => {
      const next = getPointerSnapshot();
      const prev = pointerStateRef.current;
      pointerStateRef.current = next;

      // If dragging starts, close any hover-based popups immediately
      if (!prev.isDragging && next.isDragging) {
        clearHoverTimer();
        if (nodePopperRef.current.reason === 'hover') {
          setNodePopper({ id: null, anchor: null, reason: null });
        }
        if (edgeTooltipRef.current.reason === 'hover') {
          setEdgeTooltip({ id: null, anchor: null, reason: null });
        }
      }
    });
    return () => unsubscribe();
  }, [clearHoverTimer]);

  const getAnchorFromEvent = useCallback(
    (evt: { renderedPosition?: { x: number; y: number } }) => {
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
    const cy = cyRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!cy || !rect) return null;
    const ele = cy.getElementById(id);
    if (!ele || ele.empty()) return null;
    const pos = ele.renderedPosition();
    return { top: rect.top + pos.y, left: rect.left + pos.x };
  }, []);

  const prevContainerVisibleRef = useRef(containerVisible);
  useEffect(() => {
    const becameVisible = !prevContainerVisibleRef.current && containerVisible;
    prevContainerVisibleRef.current = containerVisible;
    if (!becameVisible) return;

    setNodePopper((prev) => {
      if (prev.reason !== 'select' || !prev.id) return prev;
      const anchor = getAnchorFromElement(prev.id);
      if (!anchor) return prev;
      if (
        prev.anchor &&
        Math.abs(prev.anchor.top - anchor.top) < 0.5 &&
        Math.abs(prev.anchor.left - anchor.left) < 0.5
      ) {
        return prev;
      }
      return { ...prev, anchor };
    });

    setEdgeTooltip((prev) => {
      if (prev.reason !== 'select' || !prev.id) return prev;
      const anchor = getAnchorFromElement(prev.id);
      if (!anchor) return prev;
      if (
        prev.anchor &&
        Math.abs(prev.anchor.top - anchor.top) < 0.5 &&
        Math.abs(prev.anchor.left - anchor.left) < 0.5
      ) {
        return prev;
      }
      return { ...prev, anchor };
    });
  }, [containerVisible, getAnchorFromElement]);

  const openNodePopper = useCallback(
    (id: string, anchor: Anchor, reason: 'hover' | 'select') => {
      setNodePopper({ id, anchor, reason });
    },
    []
  );

  const openEdgeTooltip = useCallback(
    (id: string, anchor: Anchor, reason: 'hover' | 'select') => {
      setEdgeTooltip({ id, anchor, reason });
    },
    []
  );

  const handlePaneClick = useCallback(() => {
    const hasSelection = !!selected.type;
    const hasPopups =
      !!nodePopperRef.current.id || !!edgeTooltipRef.current.id || settingsOpen;
    if (!hasSelection && !hasPopups) return;

    setSelected({ type: null, id: null });
    clearHoverTimer();
    setSettingsOpen(false);
    setNodePopper({ id: null, anchor: null, reason: null });
    setEdgeTooltip({ id: null, anchor: null, reason: null });
  }, [selected, settingsOpen, setSelected, clearHoverTimer]);

  const handleNodeTap = useCallback(
    (evt: EventObjectNode) => {
      evt.stopPropagation();
      clearHoverTimer();
      const id = evt.target.id();
      const anchor = getAnchorFromEvent(evt);
      setSelected({
        type: 'node',
        id,
        anchor,
      });
      openNodePopper(id, anchor, 'select');
    },
    [setSelected, clearHoverTimer, getAnchorFromEvent, openNodePopper]
  );

  const handleEdgeTap = useCallback(
    (evt: EventObjectEdge) => {
      evt.stopPropagation();
      clearHoverTimer();
      const id = evt.target.id();
      const anchor = getAnchorFromEvent(evt);
      setSelected({
        type: 'edge',
        id,
        anchor,
      });
      openEdgeTooltip(id, anchor, 'select');
    },
    [setSelected, clearHoverTimer, getAnchorFromEvent, openEdgeTooltip]
  );

  const handleNodeHoverStart = useCallback(
    (evt: EventObjectNode) => {
      if (pointerStateRef.current.isDragging) return;

      const id = evt.target.id();
      evt.target.addClass('hovered');

      const anchor = getAnchorFromEvent(evt);
      clearHoverTimer();
      hoverTimerRef.current = window.setTimeout(() => {
        openNodePopper(id, anchor, 'hover');
      }, HOVER_POPPER_DELAY_MS);

      const node = nodeMapRef.current.get(id);
      const label = (node?.data as any)?.label ?? null;
      if (label) setHoveredState(label);
    },
    [getAnchorFromEvent, clearHoverTimer, openNodePopper, setHoveredState]
  );

  const handleNodeHoverEnd = useCallback(
    (evt: EventObjectNode) => {
      evt.target.removeClass('hovered');
      setHoveredState(null);
      clearHoverTimer();

      const current = nodePopperRef.current;
      if (current.reason === 'hover' && current.id === evt.target.id()) {
        setNodePopper({ id: null, anchor: null, reason: null });
      }
    },
    [setHoveredState, clearHoverTimer]
  );

  const handleEdgeHoverStart = useCallback(
    (evt: EventObjectEdge) => {
      if (pointerStateRef.current.isDragging) return;

      const id = evt.target.id();
      evt.target.addClass('hovered');
      const anchor = getAnchorFromEvent(evt);
      openEdgeTooltip(id, anchor, 'hover');
    },
    [getAnchorFromEvent, openEdgeTooltip]
  );

  const handleEdgeHoverEnd = useCallback((evt: EventObjectEdge) => {
    evt.target.removeClass('hovered');
    const current = edgeTooltipRef.current;
    if (current.reason === 'hover' && current.id === evt.target.id()) {
      setEdgeTooltip({ id: null, anchor: null, reason: null });
    }
  }, []);

  const handleNodeDoubleTap = useCallback((evt: EventObjectNode) => {
    const node = nodeMapRef.current.get(evt.target.id());
    const data = (node?.data ?? {}) as any;
    if (data.config) setConfiguration(data.config);
  }, []);

  // React to external selection changes (e.g., deselection)
  useEffect(() => {
    if (selected.type === 'node' && selected.id) {
      const anchor = selected.anchor ?? getAnchorFromElement(selected.id);
      if (anchor) openNodePopper(selected.id, anchor, 'select');
      // Close any edge tooltip and any other node popper
      setEdgeTooltip({ id: null, anchor: null, reason: null });
      setNodePopper((prev) =>
        prev.id === selected.id && prev.reason === 'select'
          ? prev
          : { id: selected.id, anchor, reason: 'select' }
      );
      return;
    }

    if (selected.type === 'edge' && selected.id) {
      const anchor = selected.anchor ?? getAnchorFromElement(selected.id);
      if (anchor) openEdgeTooltip(selected.id, anchor, 'select');
      setNodePopper({ id: null, anchor: null, reason: null });
      setEdgeTooltip((prev) =>
        prev.id === selected.id && prev.reason === 'select'
          ? prev
          : { id: selected.id, anchor, reason: 'select' }
      );
      return;
    }

    // Deselection: close both
    setNodePopper({ id: null, anchor: null, reason: null });
    setEdgeTooltip({ id: null, anchor: null, reason: null });
  }, [selected, getAnchorFromElement, openNodePopper, openEdgeTooltip]);

  // Instantiate Cytoscape once
  const cyStyles = useMemo(() => getCyStyles(theme), [theme]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cy = cytoscape({
      container,
      elements: [],
      style: cyStyles,
      wheelSensitivity: 0.6,
      minZoom: 0.05,
      maxZoom: 2.5,
    });

    cy.boxSelectionEnabled(false);
    cy.userPanningEnabled(true);
    cy.userZoomingEnabled(true);
    cy.autoungrabify(true);
    cy.zoom(0.1);
    cy.center();
    viewportRef.current = {
      zoom: cy.zoom(),
      pan: { ...cy.pan() },
    };

    const onPaneTap = (evt: any) => {
      if (evt.target !== cy) return;
      const hasSelection = !!selectedRef.current.type;
      const hasPopups =
        !!nodePopperRef.current.id || !!edgeTooltipRef.current.id || settingsOpenRef.current;
      if (!hasSelection && !hasPopups) return;

      setSelected({ type: null, id: null });
      clearHoverTimer();
      setSettingsOpen(false);
      setNodePopper({ id: null, anchor: null, reason: null });
      setEdgeTooltip({ id: null, anchor: null, reason: null });
    };
    const onNodeTap = (evt: EventObjectNode) => {
      evt.stopPropagation();
      clearHoverTimer();
      const id = evt.target.id();
      const anchor = getAnchorFromEvent(evt);
      setSelected({
        type: 'node',
        id,
        anchor,
      });
      setNodePopper({ id, anchor, reason: 'select' });
    };
    const onEdgeTap = (evt: EventObjectEdge) => {
      evt.stopPropagation();
      clearHoverTimer();
      const id = evt.target.id();
      const anchor = getAnchorFromEvent(evt);
      setSelected({
        type: 'edge',
        id,
        anchor,
      });
      setEdgeTooltip({ id, anchor, reason: 'select' });
    };
    const onViewportChanged = () => {
      viewportRef.current = {
        zoom: cy.zoom(),
        pan: { ...cy.pan() },
      };
    };

    cy.on('tap', onPaneTap);
    cy.on('tap', 'node', onNodeTap);
    cy.on('tap', 'edge', onEdgeTap);
    cy.on('pan zoom', onViewportChanged);
    cy.on('dbltap', 'node', handleNodeDoubleTap);
    cy.on('mouseover', 'node', handleNodeHoverStart);
    cy.on('mouseout', 'node', handleNodeHoverEnd);
    cy.on('mouseover', 'edge', handleEdgeHoverStart);
    cy.on('mouseout', 'edge', handleEdgeHoverEnd);

    cyRef.current = cy;
    return () => {
      cy.off('tap', onPaneTap);
      cy.off('tap', 'node', onNodeTap);
      cy.off('tap', 'edge', onEdgeTap);
      cy.off('pan zoom', onViewportChanged);
      cy.off('dbltap', 'node', handleNodeDoubleTap);
      cy.off('mouseover', 'node', handleNodeHoverStart);
      cy.off('mouseout', 'node', handleNodeHoverEnd);
      cy.off('mouseover', 'edge', handleEdgeHoverStart);
      cy.off('mouseout', 'edge', handleEdgeHoverEnd);
      cy.destroy();
      cyRef.current = null;
    };
  }, [
    cyStyles,
    clearHoverTimer,
    getAnchorFromEvent,
    handleNodeHoverStart,
    handleNodeHoverEnd,
    handleEdgeHoverStart,
    handleEdgeHoverEnd,
    handleNodeDoubleTap,
    setSelected,
  ]);

  // Update styles if theme changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style(cyStyles);
    cy.style().update();
  }, [cyStyles]);

  // Sync nodes/edges into Cytoscape
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (nodes.length > 0) lastNonEmptyNodesRef.current = nodes;
    if (edges.length > 0) lastNonEmptyEdgesRef.current = edges;

    const nodesForSync = nodes.length > 0 ? nodes : lastNonEmptyNodesRef.current;
    const edgesForSync = edges.length > 0 ? edges : lastNonEmptyEdgesRef.current;

    const nextIds = new Set<string>([
      ...nodesForSync.map((n) => n.id),
      ...edgesForSync.map((e) => e.id),
    ]);

    cy.batch(() => {
      cy.elements().forEach((ele) => {
        if (!nextIds.has(ele.id())) ele.remove();
      });

      nodesForSync.forEach((n) => {
        const data = (n.data ?? {}) as any;
        const stateColor =
          data.stateColor ?? resolveColorForState((n.data as any)?.config?.state);
        const displayLabel = data.showLabel === false ? '' : data.label ?? n.id;
        const bgColor = stateColor ?? theme.palette.background.paper;
        const classes = [
          computationTreeNodeMode === ConfigNodeMode.CARDS ? 'card' : 'circle',
        ];
        if (data.isStart) classes.push('start');
        if (displayLabel === '') classes.push('hidden-label');
        const position = n.position ?? { x: 0, y: 0 };
        const ele = cy.getElementById(n.id);
        const cyData = {
          id: n.id,
          label: data.label ?? n.id,
          displayLabel,
          bgColor,
          borderColor: data.isStart
            ? theme.palette.primary.main
            : theme.palette.border?.main ?? theme.palette.divider,
          borderWidth: data.isStart ? 8 : 0,
          textOutline: theme.palette.background.paper,
          width: n.width ?? CONFIG_NODE_DIAMETER,
          height: n.height ?? CONFIG_NODE_DIAMETER,
        };

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

      edgesForSync.forEach((e) => {
        const data = (e.data ?? {}) as any;
        const ele = cy.getElementById(e.id);
        const classes = ['edge', 'hidden-label'];
        if (data.compressed) classes.push('compressed');
        const cyData = {
          id: e.id,
          source: e.source,
          target: e.target,
          transition: data.transition,
          compressed: data.compressed === true,
          compressedLength: data.compressedLength,
        };

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

    cy.nodes().ungrabify();
  }, [nodes, edges, computationTreeNodeMode, theme, resolveColorForState]);

  const lastSelectedRef = useRef<string | null>(null);

  // Selection class sync
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const prev = lastSelectedRef.current;
    const next = selected.type && selected.id ? selected.id : null;
    if (prev === next) return;

    cy.batch(() => {
      if (prev) cy.getElementById(prev).removeClass('ct-selected');
      if (next) cy.getElementById(next).addClass('ct-selected');
    });
    lastSelectedRef.current = next;
  }, [selected]);

  // Resize observer for Cytoscape container
  useEffect(() => {
    const cy = cyRef.current;
    const el = containerRef.current;
    if (!cy || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const visibleNow = isContainerVisible();
      setContainerVisible(visibleNow);
      cy.resize();
      if (
        pendingMachineLoadFitRef.current &&
        nodes.length > 0 &&
        visibleNow
      ) {
        pendingMachineLoadFitRef.current = false;
        runFitView(() => {
          if (awaitingInitialRevealRef.current) {
            awaitingInitialRevealRef.current = false;
            setViewportReady(true);
          }
        });
        return;
      }
      restoreViewport();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [restoreViewport, runFitView, nodes.length, isContainerVisible]);

  // Portal switch fit handling
  const scheduleFitAfterSwitch = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    requestAnimationFrame(() => {
      cy.resize();
      setContainerVisible(isContainerVisible());
      restoreViewport();
    });
  }, [restoreViewport, isContainerVisible]);

  useEffect(() => {
    const handler: EventListener = (event) => {
      const detail = (event as CustomEvent<PortalBridgeSwitchDetail>).detail;
      if (!detail || detail.id !== 'computationTree') return;
      scheduleFitAfterSwitch();
    };
    window.addEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    return () => {
      window.removeEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    };
  }, [scheduleFitAfterSwitch]);

  // Legend (Color -> State) items (sorted for stable rendering)
  const legendItems = useMemo(() => {
    const entries = Array.from(stateColorMatching.entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([state, color]) => ({ key: state, color }));
  }, [stateColorMatching]);

  const showLegend = legendItems.length > 0 && (model?.nodes?.length ?? 0) > 0;

  const recalcLayout = useCallback(() => {
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [scheduleLayoutRestart]);

  const resetLayoutSettings = useCallback(() => {
    setComputationTreeELKSettings({
      ...DEFAULT_ELK_OPTS,
      edgeNodeSep: computationTreeNodeMode === ConfigNodeMode.CARDS ? 300 : 100,
    });
  }, [computationTreeNodeMode, setComputationTreeELKSettings]);

  return (
    <Box
      id="ComputationTree"
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 360,
        overflow: 'hidden',
        backgroundImage:
          'linear-gradient(0deg, transparent 24%, rgba(0,0,0,0.04) 25%, rgba(0,0,0,0.04) 26%, transparent 27%, transparent 74%, rgba(0,0,0,0.04) 75%, rgba(0,0,0,0.04) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0,0,0,0.04) 25%, rgba(0,0,0,0.04) 26%, transparent 27%, transparent 74%, rgba(0,0,0,0.04) 75%, rgba(0,0,0,0.04) 76%, transparent 77%, transparent)',
        backgroundSize: '24px 24px, 24px 24px',
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
      <TreeLayoutSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={computationTreeELKSettings}
        onChange={(next) => setComputationTreeELKSettings(next)}
        onReset={resetLayoutSettings}
        onRecalc={recalcLayout}
        running={layout.running}
      />

      {/* Top-left controls panel (recalculate layout and node mode switch) */}
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
            onClick={recalcLayout}
            startIcon={<Cached fontSize="small" />}
            disabled={layout.running}
            sx={{
              height: CONTROL_HEIGHT,
              borderRadius: 1.5,
              textTransform: 'none',
              px: 1.25,
            }}
          >
            Recalculate layout
          </Button>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={computationTreeNodeMode}
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
              setComputationTreeNodeMode(v);
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
                title={`Cards are disabled for trees with more than ${CARDS_LIMIT} nodes.`}
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
        addon={
          <Tooltip title="Fit view">
            <span>
              <IconButton size="small" onClick={runFitView}>
                <CenterFocusStrong fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        }
      />

      {/* Node detail popper */}
      <NodeDetailPopper
        node={nodePopper.id ? nodeMapRef.current.get(nodePopper.id) ?? null : null}
        anchor={nodePopper.anchor}
        open={containerVisible && !!nodePopper.id && !!nodePopper.anchor}
        onClose={() => {
          setSelected({ type: null, id: null });
          setNodePopper({ id: null, anchor: null, reason: null });
        }}
      />

      {/* Edge tooltip */}
      <EdgeTooltip
        open={containerVisible && !!edgeTooltip.id && !!edgeTooltip.anchor}
        anchorEl={makeVirtualAnchor(edgeTooltip.anchor)}
        transition={
          edgeTooltip.id ? (edgeMapRef.current.get(edgeTooltip.id)?.data as any)?.transition : undefined
        }
        isCompressed={
          edgeTooltip.id
            ? (edgeMapRef.current.get(edgeTooltip.id)?.data as any)?.compressed === true
            : false
        }
        compressedLength={
          edgeTooltip.id
            ? (edgeMapRef.current.get(edgeTooltip.id)?.data as any)?.compressedLength
            : undefined
        }
        sourceLabel={
          edgeTooltip.id
            ? (nodeMapRef.current.get(edgeMapRef.current.get(edgeTooltip.id)?.source ?? '')?.data as any)
                ?.label
            : undefined
        }
        targetLabel={
          edgeTooltip.id
            ? (nodeMapRef.current.get(edgeMapRef.current.get(edgeTooltip.id)?.target ?? '')?.data as any)
                ?.label
            : undefined
        }
        onClose={() => {
          setSelected({ type: null, id: null });
          setEdgeTooltip({ id: null, anchor: null, reason: null });
        }}
      />
    </Box>
  );
}

function ComputationTreeCards({ targetNodes, compressing = false }: Props) {
  const theme = useTheme();
  // Global Zustand state
  const transitions = useGlobalZustand((s) => s.transitions);
  const stateColorMatching = useGlobalZustand((s) => s.stateColorMatching);
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);

  // Graph Zustand state and setters
  const computationTreeNodeMode = useComputationTreeNodeMode();
  const setComputationTreeNodeMode = useGraphZustand(
    (s) => s.setComputationTreeNodeMode
  );
  const computationTreeELKSettings = useComputationTreeELKSettings();
  const setComputationTreeELKSettings = useGraphZustand(
    (s) => s.setComputationTreeELKSettings
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

  const { selected, setSelected, hoveredState } = useGraphUI();

  // Base graph structure
  const { model, base } = useComputationTreeData(
    targetNodes,
    !!compressing,
    computationTreeNodeMode
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(base.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>(base.edges);
  const [structureKey, setStructureKey] = useState('');

  const rf = useReactFlow();
  const nodesReady = useNodesInitialized();

  // ELK layout
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
    topoKeyOverride: structureKey,
    autoRun: false,
    onLayout: (positions) => {
      setNodes((prev) =>
        prev.map((n) => {
          const p = positions.get(n.id);
          if (!p) return n;
          const same = n.position?.x === p.x && n.position?.y === p.y;
          return same ? n : { ...n, position: p };
        })
      );
    },
  });
  const scheduleLayoutRestart = useDebouncedLayoutRestart(layout);

  // Adjust edgeNodeSep when node mode changes
  useEffect(() => {
    const edgeNodeSepTarget =
      computationTreeNodeMode === ConfigNodeMode.CARDS ? 300 : 100;
    if (computationTreeELKSettings.edgeNodeSep === edgeNodeSepTarget) return;
    setComputationTreeELKSettings({ edgeNodeSep: edgeNodeSepTarget });
  }, [
    computationTreeNodeMode,
    computationTreeELKSettings.edgeNodeSep,
    setComputationTreeELKSettings,
  ]);

  // Performance + layout tracking
  const nodesCountRef = useRef(0);
  const didInitialLayoutRef = useRef(false);
  const lastTopoKeyRef = useRef<string | null>(null);
  const fitAfterLayoutRef = useRef(false);
  const prevRunningRef = useRef(layout.running);
  const layoutRunningRef = useRef(layout.running);
  const nodesReadyRef = useRef(nodesReady);
  const manualFitPendingRef = useRef(false);
  const awaitingInitialRevealRef = useRef(false);
  const lastHandledMachineLoadRef = useRef<number>(-1);
  const [viewportReady, setViewportReady] = useState(false);

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

  // Disable cards mode if too many nodes
  const nodeCount = model?.nodes?.length ?? 0;
  const cardsDisabled = nodeCount > CARDS_LIMIT;

  useEffect(() => {
    if (computationTreeNodeMode === ConfigNodeMode.CARDS && cardsDisabled) {
      setComputationTreeNodeMode(ConfigNodeMode.CIRCLES);
      toast.warning(
        `Cards are disabled when there are more than ${CARDS_LIMIT} nodes (current: ${nodeCount}).`
      );
    }
  }, [
    cardsDisabled,
    computationTreeNodeMode,
    nodeCount,
    setComputationTreeNodeMode,
  ]);

  // If too many nodes, hide labels and only show colors
  const hideLabels = nodeCount >= COLOR_STATE_SWITCH;

  // Sync builder output into state; keep previous size/data; ELK will set positions afterwards
  useEffect(() => {
    if (!model) return;

    setNodes((prev) =>
      reconcileNodes(prev, base.nodes, (node) => {
        const stateName = (node.data as any)?.config?.state;
        const mappedColor = resolveColorForState(stateName);

        return {
          ...(node.data as any),
          showLabel: !hideLabels,
          stateColor: mappedColor,
        };
      })
    );

    setEdges((prev) => reconcileEdges(prev, base.edges));
    setStructureKey((prev) => (prev === base.topoKey ? prev : base.topoKey));
  }, [
    model,
    base.nodes,
    base.edges,
    base.topoKey,
    hideLabels,
    stateColorMatching,
    resolveColorForState,
    setNodes,
    setEdges,
  ]);

  // Start ELK once when nodes are ready
  useEffect(() => {
    if (!didInitialLayoutRef.current && nodesReady && nodes.length > 0) {
      didInitialLayoutRef.current = true;
      awaitingInitialRevealRef.current = true;
      setViewportReady(false);
      scheduleLayoutRestart();
      fitAfterLayoutRef.current = true;
    }
  }, [nodesReady, nodes.length, scheduleLayoutRestart]);

  // Start ELK on structural changes
  useEffect(() => {
    if (!nodesReady || nodes.length === 0) return;
    if (lastTopoKeyRef.current === null) {
      lastTopoKeyRef.current = structureKey;
      return;
    }
    if (lastTopoKeyRef.current === structureKey) return;
    lastTopoKeyRef.current = structureKey;

    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [structureKey, nodesReady, nodes.length, scheduleLayoutRestart]);

  // Start ELK when nodeMode changes
  useEffect(() => {
    if (nodes.length === 0) return;
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [computationTreeNodeMode, scheduleLayoutRestart, nodes.length]);

  // Re-center on every successful "Load Machine".
  useEffect(() => {
    if (!nodesReady || nodes.length === 0) return;
    if (lastHandledMachineLoadRef.current === machineLoadVersion) return;
    lastHandledMachineLoadRef.current = machineLoadVersion;
    awaitingInitialRevealRef.current = true;
    setViewportReady(false);
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [machineLoadVersion, nodesReady, nodes.length]);

  const runFitView = useCallback((onDone?: () => void) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rf.fitView({ padding: 0.2, duration: 0 });
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
          if (awaitingInitialRevealRef.current) {
            awaitingInitialRevealRef.current = false;
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

  // Handlers
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handlePaneClick = useCallback(() => {
    setSelected({ type: null, id: null });
    setSettingsOpen(false);
  }, []);

  const handleNodeClick = useCallback(
    (evt: React.MouseEvent, node: RFNode) => {
      evt.stopPropagation();
      setSelected({
        type: 'node',
        id: node.id,
        anchor: { top: evt.clientY, left: evt.clientX },
      });
    },
    []
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
    []
  );

  // Fit handling on portal switches
  const scheduleFitAfterSwitch = useCallback(() => {
    if (!nodesReadyRef.current || nodesCountRef.current === 0) return;
    if (layoutRunningRef.current) {
      manualFitPendingRef.current = true;
      return;
    }
    manualFitPendingRef.current = false;
    runFitView(() => {
      if (awaitingInitialRevealRef.current) {
        awaitingInitialRevealRef.current = false;
        setViewportReady(true);
      }
    });
  }, [runFitView]);

  useEffect(() => {
    const handler: EventListener = (event) => {
      const detail = (event as CustomEvent<PortalBridgeSwitchDetail>).detail;
      if (!detail || detail.id !== 'computationTree') return;
      scheduleFitAfterSwitch();
    };
    window.addEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    return () => {
      window.removeEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    };
  }, [scheduleFitAfterSwitch]);

  // Legend items (sorted for stable rendering)
  const legendItems = useMemo(() => {
    const entries = Array.from(stateColorMatching.entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([state, color]) => ({ key: state, color }));
  }, [stateColorMatching]);

  const showLegend = legendItems.length > 0 && (model?.nodes?.length ?? 0) > 0;

  const recalcLayout = useCallback(() => {
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [scheduleLayoutRestart]);

  const resetLayoutSettings = useCallback(() => {
    setComputationTreeELKSettings({
      ...DEFAULT_ELK_OPTS,
      edgeNodeSep: computationTreeNodeMode === ConfigNodeMode.CARDS ? 300 : 100,
    });
  }, [computationTreeNodeMode, setComputationTreeELKSettings]);

  return (
    <ReactFlow
      id="ComputationTreeCards"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 360,
        opacity: viewportReady ? 1 : 0,
        pointerEvents: viewportReady ? 'auto' : 'none',
        transition: 'opacity 120ms ease',
      }}
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onPaneClick={handlePaneClick}
      onNodeClick={handleNodeClick}
      onEdgeClick={handleEdgeClick}
      nodeTypes={rfNodeTypes}
      edgeTypes={rfEdgeTypes}
      defaultEdgeOptions={rfDefaultEdgeOptions}
      proOptions={{ hideAttribution: true }}
      minZoom={0.05}
      defaultViewport={{ x: 0, y: 0, zoom: 0.1 }}
      nodesDraggable={false}
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
      <TreeLayoutSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={computationTreeELKSettings}
        onChange={(next) => setComputationTreeELKSettings(next)}
        onReset={resetLayoutSettings}
        onRecalc={recalcLayout}
        running={layout.running}
      />

      {/* Top-left controls panel (recalculate layout and node mode switch) */}
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
            onClick={recalcLayout}
            startIcon={<Cached fontSize="small" />}
            disabled={layout.running}
            sx={{
              height: CONTROL_HEIGHT,
              borderRadius: 1.5,
              textTransform: 'none',
              px: 1.25,
            }}
          >
            Recalculate layout
          </Button>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={computationTreeNodeMode}
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
              setComputationTreeNodeMode(v);
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
                title={`Cards are disabled for trees with more than ${CARDS_LIMIT} nodes.`}
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
        addon={
          <Tooltip title="Fit view">
            <span>
              <IconButton size="small" onClick={runFitView}>
                <CenterFocusStrong fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        }
      />

      <Background gap={10} size={1} />
    </ReactFlow>
  );
}

export function ComputationTree(props: Props) {
  const computationTreeNodeMode = useComputationTreeNodeMode();
  if (computationTreeNodeMode === ConfigNodeMode.CARDS) {
    return <ComputationTreeCards {...props} />;
  }
  return <ComputationTreeCircles {...props} />;
}

export function ComputationTreeWrapper({
  targetNodes = 10,
  compressing = false,
}: {
  targetNodes?: number;
  compressing?: boolean;
}) {
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);
  return (
    <ReactFlowProvider>
      <GraphUIProvider key={machineLoadVersion}>
        <ComputationTree targetNodes={targetNodes} compressing={compressing} />
      </GraphUIProvider>
    </ReactFlowProvider>
  );
}
