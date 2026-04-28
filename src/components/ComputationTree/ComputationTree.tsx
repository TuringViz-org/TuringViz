// src/components/ComputationTree/ComputationTree.tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import cytoscape, {
  type Core as CyCore,
  type EventObjectEdge,
  type EventObjectNode,
} from 'cytoscape';
import {
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useStore,
  MarkerType,
  Background,
  type ReactFlowState,
  type Viewport,
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
} from '@mui/material';
import { Adjust, ViewAgenda, Tune, CenterFocusStrong } from '@mui/icons-material';
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
import { LoadingOverlay } from '@components/shared/LoadingOverlay';

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
  ConfigNodeMode,
  DEFAULT_GRAPH_CARDS_ELK_OPTS,
  DEFAULT_GRAPH_ELK_OPTS,
  DEFAULT_GRAPH_NODES_ELK_OPTS,
  DEFAULT_TREE_DEPTH,
  HOVER_POPPER_DELAY_MS,
  MAX_COMPUTATION_TREE_TARGET_NODES,
} from '@utils/constants';
import { useElkLayout } from './layout/useElkLayout';
import { TreeLayoutSettingsPanel } from './layout/LayoutSettingsPanel';
import { useDebouncedLayoutRestart } from '@hooks/useDebouncedLayoutRestart';
import { GraphUIProvider, useGraphUI } from '@components/shared/GraphUIContext';
import {
  PORTAL_BRIDGE_BEFORE_SWITCH_EVENT,
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
const NODES_MIN_FIT_ZOOM = 0.02;
const MIN_COMPUTE_OVERLAY_MS = 180;

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

const getCyStyles = (theme: any): any[] => [
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
        label: '',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 14,
        'font-weight': 600,
        color: theme.palette.text.primary,
        'text-outline-width': 2,
        'text-outline-color': normalizeColor(theme.palette.background.paper),
        'background-color': normalizeColor(theme.palette.background.paper),
        'border-width': 'data(borderWidth)',
        'border-color': normalizeColor(theme.palette.border?.main ?? theme.palette.divider),
        'border-style': 'solid',
        shape: 'ellipse',
        'z-index': 5,
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'node[displayLabel]',
      style: { label: 'data(displayLabel)' },
    },
    {
      selector: 'node[textOutline]',
      style: { 'text-outline-color': 'data(textOutline)' },
    },
    {
      selector: 'node[bgColor]',
      style: { 'background-color': 'data(bgColor)' },
    },
    {
      selector: 'node[borderColor]',
      style: { 'border-color': 'data(borderColor)' },
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
        'border-color': normalizeColor(theme.palette.primary.main),
        'border-width': 8,
      },
    },
    {
      selector: 'node.hovered',
      style: {
        'border-color':
          normalizeColor(theme.palette.border?.dark) ??
          normalizeColor(theme.palette.primary.dark),
        'border-width': 8,
      },
    },
    {
      selector: 'node.ct-selected',
      style: {
        'border-color': normalizeColor(theme.palette.primary.dark),
        'border-width': 9,
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
        'curve-style': 'straight',
        width: GRAPH_EDGE_COMPRESSED_WIDTH,
        'line-color': normalizeColor(theme.palette.primary.main),
        'target-arrow-color': normalizeColor(theme.palette.primary.main),
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
  nodeMode: ConfigNodeMode,
  paused: boolean
): {
  model: ComputationTreeModel | null;
  base: ReturnType<typeof buildComputationTreeGraph>;
  isComputing: boolean;
} {
  const transitions = useGlobalZustand((s) => s.transitions);
  const blank = useGlobalZustand((s) => s.blank);
  const startState = useGlobalZustand((s) => s.startState);
  const numberOfTapes = useGlobalZustand((s) => s.numberOfTapes);
  const input = useGlobalZustand((s) => s.input);

  const [model, setModel] = useState<ComputationTreeModel | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [base, setBase] = useState<ReturnType<typeof buildComputationTreeGraph>>({
    nodes: [],
    edges: [],
    topoKey: '',
  });
  const requestRef = useRef(0);
  const computeHideTimerRef = useRef<number | null>(null);
  const computeStartedAtRef = useRef(0);
  const pendingModelFromComputeRef = useRef(false);

  useLayoutEffect(() => {
    if (computeHideTimerRef.current != null) {
      window.clearTimeout(computeHideTimerRef.current);
      computeHideTimerRef.current = null;
    }
    if (paused) {
      pendingModelFromComputeRef.current = false;
      setIsComputing(false);
      return;
    }
    const startConfig = getStartConfiguration();
    const reqId = requestRef.current + 1;
    requestRef.current = reqId;
    setIsComputing(true);
    computeStartedAtRef.current = performance.now();
    pendingModelFromComputeRef.current = false;
    const requestedTargetNodes =
      nodeMode === ConfigNodeMode.CARDS
        ? Math.min(targetNodes, CARDS_LIMIT)
        : targetNodes;
    const effectiveDepth = compressing
      ? MAX_COMPUTATION_TREE_TARGET_NODES
      : requestedTargetNodes;

    computeComputationTreeInWorker({
      depth: effectiveDepth,
      targetNodes: requestedTargetNodes,
      compressing,
      transitions,
      numberOfTapes,
      blank,
      startConfig,
    })
      .then((tree) => {
        if (requestRef.current !== reqId) return;
        pendingModelFromComputeRef.current = true;
        setModel(tree);
      })
      .catch(() => {
        if (requestRef.current !== reqId) return;
        try {
          const tree = getComputationTreeFromInputs(
            startConfig,
            transitions,
            numberOfTapes,
            blank,
            effectiveDepth,
            compressing,
            (msg) => toast.warning(msg),
            requestedTargetNodes
          );
          pendingModelFromComputeRef.current = true;
          setModel(tree);
        } catch {
          pendingModelFromComputeRef.current = false;
          setIsComputing(false);
        }
      });

    return () => {
      if (computeHideTimerRef.current != null) {
        window.clearTimeout(computeHideTimerRef.current);
        computeHideTimerRef.current = null;
      }
    };
  }, [
    targetNodes,
    compressing,
    transitions,
    blank,
    numberOfTapes,
    startState,
    input,
    nodeMode,
    paused,
  ]);

  useEffect(() => {
    if (!model) return;
    setBase(buildComputationTreeGraph(model, transitions, nodeMode));
    if (!pendingModelFromComputeRef.current) return;
    pendingModelFromComputeRef.current = false;
    const elapsed = performance.now() - computeStartedAtRef.current;
    const remaining = Math.max(0, MIN_COMPUTE_OVERLAY_MS - elapsed);
    if (computeHideTimerRef.current != null) {
      window.clearTimeout(computeHideTimerRef.current);
      computeHideTimerRef.current = null;
    }
    if (remaining <= 0) {
      setIsComputing(false);
      return;
    }
    computeHideTimerRef.current = window.setTimeout(() => {
      computeHideTimerRef.current = null;
      setIsComputing(false);
    }, remaining);
  }, [model, transitions, nodeMode]);

  return { model, base, isComputing };
}

type Props = { targetNodes: number; compressing?: boolean; paused?: boolean };

function ComputationTreeCircles({ targetNodes, compressing = false, paused = false }: Props) {
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
  const { model, base, isComputing } = useComputationTreeData(
    targetNodes,
    !!compressing,
    computationTreeNodeMode,
    paused
  );

  const [nodes, setNodes] = useState<RFNode[]>(base.nodes);
  const [edges, setEdges] = useState<RFEdge[]>(base.edges);
  const [structureKey, setStructureKey] = useState('');
  const [containerVisible, setContainerVisible] = useState(true);
  const [viewportReady, setViewportReady] = useState(false);
  const [autoResizeLayoutEnabled, setAutoResizeLayoutEnabled] = useState(true);
  const fitAfterLayoutRef = useRef(false);
  const skipNextAutoResizeFitRef = useRef(false);
  const pendingLayoutViewportFitRef = useRef(false);
  const layoutPositionsAppliedRef = useRef(false);
  const pendingRevealFitRef = useRef(false);
  const handleAutoResizeLayout = useCallback(() => {
    if (nodes.length === 0) return;
    if (skipNextAutoResizeFitRef.current) {
      skipNextAutoResizeFitRef.current = false;
      return;
    }
    fitAfterLayoutRef.current = true;
  }, [nodes.length]);

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
    autoDirection: computationTreeELKSettings.autoDirection ?? true,
    scaleToFit: true,
    maxAxisScale:
      computationTreeNodeMode === ConfigNodeMode.CARDS ? undefined : 1.45,
    containerRef,
    topoKeyOverride: structureKey,
    autoRun: false,
    autoResizeLayoutEnabled: !paused && autoResizeLayoutEnabled,
    onAutoResizeLayout: handleAutoResizeLayout,
    onLayout: (positions) => {
      if (fitAfterLayoutRef.current) {
        pendingLayoutViewportFitRef.current = true;
        layoutPositionsAppliedRef.current = false;
      }
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

  // Apply mode-specific layout defaults when node mode changes
  useEffect(() => {
    const target =
      computationTreeNodeMode === ConfigNodeMode.CARDS
        ? DEFAULT_GRAPH_CARDS_ELK_OPTS
        : DEFAULT_GRAPH_NODES_ELK_OPTS;
    const same =
      computationTreeELKSettings.nodeSep === target.nodeSep &&
      computationTreeELKSettings.rankSep === target.rankSep &&
      computationTreeELKSettings.edgeSep === target.edgeSep &&
      computationTreeELKSettings.edgeNodeSep === target.edgeNodeSep &&
      computationTreeELKSettings.padding === target.padding;
    if (same) return;
    setComputationTreeELKSettings({
      nodeSep: target.nodeSep,
      rankSep: target.rankSep,
      edgeSep: target.edgeSep,
      edgeNodeSep: target.edgeNodeSep,
      padding: target.padding,
    });
  }, [computationTreeNodeMode, computationTreeELKSettings, setComputationTreeELKSettings]);

  // Performance + layout tracking
  const didInitialLayoutRef = useRef(false);
  const lastTopoKeyRef = useRef<string | null>(null);
  const prevRunningRef = useRef(layout.running);
  const pendingMachineLoadFitRef = useRef(false);
  const awaitingInitialRevealRef = useRef(false);
  const lastHandledMachineLoadRef = useRef<number>(-1);
  useEffect(() => {
    if (nodes.length === 0) setViewportReady(false);
  }, [nodes.length]);

  const nodeCount = model?.nodes?.length ?? 0;

  // If too many nodes, hide labels and only show colors
  const hideLabels = nodeCount >= COLOR_STATE_SWITCH;

  // Sync builder output into state; keep previous size/data; ELK will set positions afterwards
  useEffect(() => {
    if (!model) return;
    const topologyChanged = base.topoKey !== structureKey;
    if (topologyChanged) {
      awaitingInitialRevealRef.current = true;
      setViewportReady(false);
    }

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
    structureKey,
    hideLabels,
    stateColorMatching,
    setNodes,
    setEdges,
  ]);

  // Start ELK once when nodes are ready
  useEffect(() => {
    if (paused) return;
    if (!didInitialLayoutRef.current && nodes.length > 0) {
      didInitialLayoutRef.current = true;
      awaitingInitialRevealRef.current = true;
      setViewportReady(false);
      scheduleLayoutRestart();
      fitAfterLayoutRef.current = true;
    }
  }, [nodes.length, scheduleLayoutRestart, paused]);

  // Start ELK on structural changes
  useEffect(() => {
    if (paused) return;
    if (nodes.length === 0) return;
    if (lastTopoKeyRef.current === null) {
      lastTopoKeyRef.current = structureKey;
      return;
    }
    if (lastTopoKeyRef.current === structureKey) return;
    lastTopoKeyRef.current = structureKey;

    awaitingInitialRevealRef.current = true;
    setViewportReady(false);
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [structureKey, nodes.length, scheduleLayoutRestart, paused]);

  // Start ELK when nodeMode changes
  useEffect(() => {
    if (paused) return;
    if (nodes.length === 0) return;
    awaitingInitialRevealRef.current = true;
    setViewportReady(false);
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [computationTreeNodeMode, scheduleLayoutRestart, nodes.length, paused]);

  // Fit helper for Cytoscape
  const ensureStartNodeVisibleInCy = useCallback((cy: CyCore) => {
    const startNode = cy.$('node.start').first();
    if (!startNode || startNode.empty()) return;
    const rendered = startNode.renderedPosition();
    if (!rendered || !Number.isFinite(rendered.x) || !Number.isFinite(rendered.y)) return;

    const width = cy.width();
    const height = cy.height();
    if (!(width > 0) || !(height > 0)) return;

    const margin = 24;
    let dx = 0;
    let dy = 0;

    if (rendered.x < margin) dx = margin - rendered.x;
    else if (rendered.x > width - margin) dx = width - margin - rendered.x;

    if (rendered.y < margin) dy = margin - rendered.y;
    else if (rendered.y > height - margin) dy = height - margin - rendered.y;

    if (dx === 0 && dy === 0) return;

    const pan = cy.pan();
    cy.pan({ x: pan.x + dx, y: pan.y + dy });
  }, []);

  const runFitView = useCallback((onDone?: () => void) => {
    const cy = cyRef.current;
    if (!cy) return;

    requestAnimationFrame(() => {
      cy.resize();
      cy.fit(cy.elements(), 30);
      if (cy.zoom() < NODES_MIN_FIT_ZOOM) {
        cy.zoom({
          level: NODES_MIN_FIT_ZOOM,
          renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
        });
      }
      ensureStartNodeVisibleInCy(cy);
      viewportRef.current = {
        zoom: cy.zoom(),
        pan: { ...cy.pan() },
      };
      onDone?.();
    });
  }, [ensureStartNodeVisibleInCy]);

  const isContainerVisible = useCallback(() => {
    const el = containerRef.current;
    return !!el && el.clientWidth > 0 && el.clientHeight > 0;
  }, []);

  useEffect(() => {
    setContainerVisible(isContainerVisible());
  }, [isContainerVisible]);

  // Re-center on every successful "Load Machine".
  useEffect(() => {
    if (paused) return;
    if (lastHandledMachineLoadRef.current === machineLoadVersion) return;
    pendingMachineLoadFitRef.current = !isContainerVisible();
    awaitingInitialRevealRef.current = true;
    setViewportReady(false);
    if (nodes.length === 0) return;
    lastHandledMachineLoadRef.current = machineLoadVersion;
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [machineLoadVersion, nodes.length, isContainerVisible, paused]);

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
          awaitingInitialRevealRef.current = false;
          setViewportReady(true);
        }
      });
    } else {
      // Layout finished while tab is hidden — defer reveal until visible
      pendingRevealFitRef.current = true;
    }
  }, [layout.running, runFitView, isContainerVisible]);

  useEffect(() => {
    const justFinished = prevRunningRef.current && !layout.running;
    if (justFinished) {
      if (fitAfterLayoutRef.current && nodes.length > 0) {
        fitAfterLayoutRef.current = false;
        completePendingLayoutFit();
      }
    }

    prevRunningRef.current = layout.running;
  }, [layout.running, nodes.length, completePendingLayoutFit]);

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

  const refreshSelectedAnchors = useCallback(() => {
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
  }, [getAnchorFromElement]);

  const prevContainerVisibleRef = useRef(containerVisible);
  useEffect(() => {
    const becameVisible = !prevContainerVisibleRef.current && containerVisible;
    prevContainerVisibleRef.current = containerVisible;
    if (!becameVisible) return;
    refreshSelectedAnchors();
  }, [containerVisible, refreshSelectedAnchors]);

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
      webgl: true,
      elements: [],
      style: cyStyles,
      minZoom: 0.01,
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
      refreshSelectedAnchors();
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
    refreshSelectedAnchors,
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
        const bgColor = stateColor ?? normalizeColor(theme.palette.background.paper);
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
            ? normalizeColor(theme.palette.primary.main)
            : normalizeColor(theme.palette.border?.main) ??
              normalizeColor(theme.palette.divider),
          borderWidth: data.isStart ? 8 : 0,
          textOutline: normalizeColor(theme.palette.background.paper),
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
    if (pendingLayoutViewportFitRef.current) {
      layoutPositionsAppliedRef.current = true;
      completePendingLayoutFit();
    }
  }, [
    nodes,
    edges,
    computationTreeNodeMode,
    theme,
    resolveColorForState,
    completePendingLayoutFit,
  ]);

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
    let wasVisible = isContainerVisible();
    const ro = new ResizeObserver(() => {
      const visibleNow = isContainerVisible();
      const justBecameVisible = !wasVisible && visibleNow;
      wasVisible = visibleNow;
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
          pendingRevealFitRef.current = false;
          refreshSelectedAnchors();
        });
        return;
      }
      // Layout finished while hidden — now visible, so perform deferred reveal
      if (pendingRevealFitRef.current && visibleNow && nodes.length > 0) {
        pendingRevealFitRef.current = false;
        runFitView(() => {
          pendingMachineLoadFitRef.current = false;
          if (awaitingInitialRevealRef.current) {
            awaitingInitialRevealRef.current = false;
            setViewportReady(true);
          }
          refreshSelectedAnchors();
        });
        return;
      }
      // Container just became visible while still in loading state — layout
      // was never run because runLayout early-returned on zero dimensions.
      // Re-trigger the full layout + fit cycle now.
      if (justBecameVisible && !viewportReady && !layout.running && nodes.length > 0) {
        awaitingInitialRevealRef.current = true;
        fitAfterLayoutRef.current = true;
        pendingLayoutViewportFitRef.current = true;
        scheduleLayoutRestart();
        return;
      }
      if (layout.running || fitAfterLayoutRef.current || pendingLayoutViewportFitRef.current) {
        refreshSelectedAnchors();
        return;
      }
      restoreViewport();
      refreshSelectedAnchors();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    layout.running,
    restoreViewport,
    runFitView,
    nodes.length,
    isContainerVisible,
    refreshSelectedAnchors,
    viewportReady,
    scheduleLayoutRestart,
  ]);

  // Portal switch fit handling
  const scheduleFitAfterSwitch = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    requestAnimationFrame(() => {
      cy.resize();
      setContainerVisible(isContainerVisible());
      restoreViewport();
      refreshSelectedAnchors();
    });
  }, [restoreViewport, isContainerVisible, refreshSelectedAnchors]);

  useEffect(() => {
    const handler: EventListener = (event) => {
      const detail = (event as CustomEvent<PortalBridgeSwitchDetail>).detail;
      if (!detail || detail.id !== 'computationTree') return;
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

  useEffect(() => {
    let rafId: number | null = null;
    const scheduleRefresh = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        refreshSelectedAnchors();
      });
    };

    window.addEventListener('scroll', scheduleRefresh, true);
    window.addEventListener('resize', scheduleRefresh);
    return () => {
      window.removeEventListener('scroll', scheduleRefresh, true);
      window.removeEventListener('resize', scheduleRefresh);
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [refreshSelectedAnchors]);

  // Legend (Color -> State) items (sorted for stable rendering)
  const legendItems = useMemo(() => {
    const entries = Array.from(stateColorMatching.entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([state, color]) => ({ key: state, color }));
  }, [stateColorMatching]);

  const showLegend = legendItems.length > 0 && (model?.nodes?.length ?? 0) > 0;
  const structureSyncPending = base.topoKey !== structureKey;
  const loadingMaskVisible =
    !viewportReady || layout.running || isComputing || structureSyncPending;

  const requestNodeModeChange = useCallback(
    (nextMode: ConfigNodeMode) => {
      setComputationTreeNodeMode(nextMode);
    },
    [setComputationTreeNodeMode]
  );

  const recalcLayout = useCallback(() => {
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [scheduleLayoutRestart]);

  const resetLayoutSettings = useCallback(() => {
    setComputationTreeELKSettings({
      ...(computationTreeNodeMode === ConfigNodeMode.CARDS
        ? DEFAULT_GRAPH_CARDS_ELK_OPTS
        : DEFAULT_GRAPH_ELK_OPTS),
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
          opacity: loadingMaskVisible ? 0 : 1,
          pointerEvents: loadingMaskVisible ? 'none' : 'auto',
          transition: loadingMaskVisible ? 'none' : 'opacity 120ms ease',
        }}
      />

      {loadingMaskVisible && (
        <LoadingOverlay label={isComputing ? 'Computing tree...' : 'Calculating layout...'} />
      )}

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
        mode={computationTreeNodeMode}
      />

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
          <Button
            size="small"
            variant="contained"
            onClick={() => runFitView()}
            startIcon={<CenterFocusStrong fontSize="small" />}
            disabled={!viewportReady || layout.running}
            sx={{
              height: CONTROL_HEIGHT,
              borderRadius: 1.5,
              textTransform: 'none',
              px: 1.25,
            }}
          >
            Fit view
          </Button>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={computationTreeNodeMode}
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

            <ToggleButton value={ConfigNodeMode.CARDS} aria-label="card nodes">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <ViewAgenda fontSize="small" />
                <span>Cards</span>
              </Stack>
            </ToggleButton>
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

function ComputationTreeCards({ targetNodes, compressing = false, paused = false }: Props) {
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
  const { model, base, isComputing } = useComputationTreeData(
    targetNodes,
    !!compressing,
    computationTreeNodeMode,
    paused
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(base.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>(base.edges);
  const [structureKey, setStructureKey] = useState('');
  const [autoResizeLayoutEnabled, setAutoResizeLayoutEnabled] = useState(true);
  const fitAfterLayoutRef = useRef(false);
  const restoreAfterLayoutRef = useRef(false);
  const handleAutoResizeLayout = useCallback(() => {
    if (nodes.length === 0) return;
    restoreAfterLayoutRef.current = true;
  }, [nodes.length]);

  const rf = useReactFlow();
  const nodesReady = useNodesInitialized();
  const viewportWidth = useStore((s: ReactFlowState) => s.width);
  const viewportHeight = useStore((s: ReactFlowState) => s.height);

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
    autoDirection: computationTreeELKSettings.autoDirection ?? true,
    scaleToFit: true,
    maxAxisScale:
      computationTreeNodeMode === ConfigNodeMode.CARDS ? undefined : 1.45,
    viewportWidth,
    viewportHeight,
    topoKeyOverride: structureKey,
    autoRun: false,
    autoResizeLayoutEnabled: !paused && autoResizeLayoutEnabled,
    onAutoResizeLayout: handleAutoResizeLayout,
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

  // Apply mode-specific layout defaults when node mode changes
  useEffect(() => {
    const target =
      computationTreeNodeMode === ConfigNodeMode.CARDS
        ? DEFAULT_GRAPH_CARDS_ELK_OPTS
        : DEFAULT_GRAPH_NODES_ELK_OPTS;
    const same =
      computationTreeELKSettings.nodeSep === target.nodeSep &&
      computationTreeELKSettings.rankSep === target.rankSep &&
      computationTreeELKSettings.edgeSep === target.edgeSep &&
      computationTreeELKSettings.edgeNodeSep === target.edgeNodeSep &&
      computationTreeELKSettings.padding === target.padding;
    if (same) return;
    setComputationTreeELKSettings({
      nodeSep: target.nodeSep,
      rankSep: target.rankSep,
      edgeSep: target.edgeSep,
      edgeNodeSep: target.edgeNodeSep,
      padding: target.padding,
    });
  }, [computationTreeNodeMode, computationTreeELKSettings, setComputationTreeELKSettings]);

  // Performance + layout tracking
  const nodesCountRef = useRef(0);
  const didInitialLayoutRef = useRef(false);
  const lastTopoKeyRef = useRef<string | null>(null);
  const prevRunningRef = useRef(layout.running);
  const layoutRunningRef = useRef(layout.running);
  const nodesReadyRef = useRef(nodesReady);
  const manualFitPendingRef = useRef(false);
  const awaitingInitialRevealRef = useRef(false);
  const lastHandledMachineLoadRef = useRef<number>(-1);
  const [viewportReady, setViewportReady] = useState(false);
  const pendingReFitRef = useRef(false);
  const viewportRef = useRef<Viewport | null>(null);
  const viewportVisibleRef = useRef(false);
  const initialViewportSettledRef = useRef(false);
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
    if (nodes.length === 0) {
      initialViewportSettledRef.current = false;
      setViewportReady(false);
    }
  }, [nodes.length]);

  const storeViewport = useCallback(
    (viewport?: Viewport) => {
      viewportRef.current = viewport ?? rf.getViewport();
    },
    [rf]
  );
  const structureSyncPending = base.topoKey !== structureKey;
  const showLoadingOverlay =
    !viewportReady || layout.running || isComputing || structureSyncPending;
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

  const nodeCount = model?.nodes?.length ?? 0;

  // If too many nodes, hide labels and only show colors
  const hideLabels = nodeCount >= COLOR_STATE_SWITCH;

  // Sync builder output into state; keep previous size/data; ELK will set positions afterwards
  useEffect(() => {
    if (!model) return;
    const topologyChanged = base.topoKey !== structureKey;
    if (topologyChanged) {
      awaitingInitialRevealRef.current = true;
      initialViewportSettledRef.current = false;
      setViewportReady(false);
    }

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
    structureKey,
    hideLabels,
    stateColorMatching,
    resolveColorForState,
    setNodes,
    setEdges,
  ]);

  // Start ELK once when nodes are ready
  useEffect(() => {
    if (paused) return;
    if (!didInitialLayoutRef.current && nodesReady && nodes.length > 0) {
      didInitialLayoutRef.current = true;
      awaitingInitialRevealRef.current = true;
      initialViewportSettledRef.current = false;
      setViewportReady(false);
      scheduleLayoutRestart();
      fitAfterLayoutRef.current = true;
    }
  }, [nodesReady, nodes.length, scheduleLayoutRestart, paused]);

  // Start ELK on structural changes
  useEffect(() => {
    if (paused) return;
    if (!nodesReady || nodes.length === 0) return;
    if (lastTopoKeyRef.current === null) {
      lastTopoKeyRef.current = structureKey;
      return;
    }
    if (lastTopoKeyRef.current === structureKey) return;
    lastTopoKeyRef.current = structureKey;

    awaitingInitialRevealRef.current = true;
    initialViewportSettledRef.current = false;
    setViewportReady(false);
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [structureKey, nodesReady, nodes.length, scheduleLayoutRestart, paused]);

  // Start ELK when nodeMode changes
  useEffect(() => {
    if (paused) return;
    if (nodes.length === 0) return;
    awaitingInitialRevealRef.current = true;
    initialViewportSettledRef.current = false;
    setViewportReady(false);
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [computationTreeNodeMode, scheduleLayoutRestart, nodes.length, paused]);

  // Re-center on every successful "Load Machine".
  useEffect(() => {
    if (paused) return;
    if (!nodesReady || nodes.length === 0) return;
    if (lastHandledMachineLoadRef.current === machineLoadVersion) return;
    lastHandledMachineLoadRef.current = machineLoadVersion;
    awaitingInitialRevealRef.current = true;
    initialViewportSettledRef.current = false;
    setViewportReady(false);
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [machineLoadVersion, nodesReady, nodes.length, paused]);

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
    if (!initialViewportSettledRef.current) return false;
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

  const revealViewport = useCallback(() => {
    initialViewportSettledRef.current = true;
    setViewportReady(true);
  }, []);

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
          if (awaitingInitialRevealRef.current) {
            awaitingInitialRevealRef.current = false;
          }
        } else {
          runFitView(() => {
            if (awaitingInitialRevealRef.current) {
              awaitingInitialRevealRef.current = false;
              revealViewport();
            }
          });
        }
      }
      if (manualFitPendingRef.current && nodesCountRef.current > 0) {
        manualFitPendingRef.current = false;
        restoreViewportOrFit(() => {
          revealViewport();
        });
      }
      if (restoreAfterLayoutRef.current && nodesCountRef.current > 0) {
        restoreAfterLayoutRef.current = false;
        restoreViewportOrFit(() => {
          revealViewport();
        });
      }
    }

    prevRunningRef.current = layout.running;
  }, [
    layout.running,
    nodes.length,
    revealViewport,
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
      revealViewport();
    });
  }, [viewportWidth, viewportHeight, runFitView, revealViewport]);

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
      revealViewport();
    });
  }, [viewportWidth, viewportHeight, restoreViewportOrFit, revealViewport]);

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
      revealViewport();
    });
  }, [restoreViewportOrFit, revealViewport]);

  useEffect(() => {
    const handleBeforeSwitch: EventListener = (event) => {
      const detail = (event as CustomEvent<PortalBridgeSwitchDetail>).detail;
      if (!detail || detail.id !== 'computationTree') return;
      setViewportReady(false);
    };

    const handler: EventListener = (event) => {
      const detail = (event as CustomEvent<PortalBridgeSwitchDetail>).detail;
      if (!detail || detail.id !== 'computationTree') return;
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

  // Legend items (sorted for stable rendering)
  const legendItems = useMemo(() => {
    const entries = Array.from(stateColorMatching.entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([state, color]) => ({ key: state, color }));
  }, [stateColorMatching]);

  const showLegend = legendItems.length > 0 && (model?.nodes?.length ?? 0) > 0;

  const requestNodeModeChange = useCallback(
    (nextMode: ConfigNodeMode) => {
      setComputationTreeNodeMode(nextMode);
    },
    [setComputationTreeNodeMode]
  );

  const recalcLayout = useCallback(() => {
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [scheduleLayoutRestart]);

  const resetLayoutSettings = useCallback(() => {
    setComputationTreeELKSettings({
      ...(computationTreeNodeMode === ConfigNodeMode.CARDS
        ? DEFAULT_GRAPH_CARDS_ELK_OPTS
        : DEFAULT_GRAPH_ELK_OPTS),
    });
  }, [computationTreeNodeMode, setComputationTreeELKSettings]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 360 }}>
      <ReactFlow
        id="ComputationTreeCards"
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
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={handlePaneClick}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onMoveEnd={handleMoveEnd}
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
        mode={computationTreeNodeMode}
      />

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
          <Button
            size="small"
            variant="contained"
            onClick={() => runFitView()}
            startIcon={<CenterFocusStrong fontSize="small" />}
            disabled={loadingMaskVisible}
            sx={{
              height: CONTROL_HEIGHT,
              borderRadius: 1.5,
              textTransform: 'none',
              px: 1.25,
            }}
          >
            Fit view
          </Button>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={computationTreeNodeMode}
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

            <ToggleButton value={ConfigNodeMode.CARDS} aria-label="card nodes">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <ViewAgenda fontSize="small" />
                <span>Cards</span>
              </Stack>
            </ToggleButton>
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
        <LoadingOverlay label={isComputing ? 'Computing tree...' : 'Calculating layout...'} />
      )}
    </Box>
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
  targetNodes = DEFAULT_TREE_DEPTH,
  compressing = false,
  paused = false,
}: {
  targetNodes?: number;
  compressing?: boolean;
  paused?: boolean;
}) {
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);
  return (
    <ReactFlowProvider>
      <GraphUIProvider key={machineLoadVersion}>
        <ComputationTree targetNodes={targetNodes} compressing={compressing} paused={paused} />
      </GraphUIProvider>
    </ReactFlowProvider>
  );
}
