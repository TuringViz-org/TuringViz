// src/components/ConfigGraph/ConfigGraphCircles.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cytoscape, {
  type Core as CyCore,
  type EventObjectEdge,
  type EventObjectNode,
  type Stylesheet,
} from 'cytoscape';
import {
  Box,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Fab,
  Paper,
  Popper,
  ClickAwayListener,
  Stack,
  IconButton,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { Cached, Adjust, ViewAgenda, Tune, CenterFocusStrong } from '@mui/icons-material';
import type { VirtualElement } from '@popperjs/core';
import { toast } from 'sonner';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

import { LegendPanel } from '@components/shared/LegendPanel';
import ConfigCard from '@components/ConfigGraph/ConfigVisualization/ConfigCard';
import { EdgeTooltip } from '@components/ConfigGraph/edges/EdgeTooltip';

import {
  CONFIG_CARD_HEIGHT_ESTIMATE,
  CONFIG_CARD_WIDTH,
  CONFIG_NODE_DIAMETER,
  CONTROL_HEIGHT,
  CARDS_LIMIT,
  COLOR_STATE_SWITCH,
} from './util/constants';
import type { ConfigGraph as ConfigGraphModel } from '@tmfunctions/ConfigGraph';

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
  if (direct) return normalizeColor(direct);
  const lower = key.toLowerCase();
  if (acceptingStates.includes(lower)) return 'accept';
  if (rejectingStates.includes(lower)) return 'reject';
  return undefined;
};
import { buildConfigGraph } from './util/buildConfigGraph';
import {
  CARDS_CONFIRM_THRESHOLD,
  ConfigNodeMode,
  DEFAULT_ELK_OPTS,
  HOVER_POPPER_DELAY_MS,
} from '@utils/constants';
import { useElkLayout } from '@components/ComputationTree/layout/useElkLayout';
import { TreeLayoutSettingsPanel as LayoutSettingsPanel } from '@components/ComputationTree/layout/LayoutSettingsPanel';
import { useDebouncedLayoutRestart } from '@hooks/useDebouncedLayoutRestart';
import { useGraphUI } from '@components/shared/GraphUIContext';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  useConfigGraphNodeMode,
  useConfigGraphELKSettings,
  useGraphZustand,
} from '@zustands/GraphZustand';
import { reconcileEdges, reconcileNodes } from '@utils/reactflow';
import { setConfiguration } from '@tmfunctions/Running';
import type { Configuration } from '@mytypes/TMTypes';
import {
  getPointerSnapshot,
  subscribePointerTracker,
  type PointerSnapshot,
} from '@components/shared/pointerTracker';
import {
  PORTAL_BRIDGE_SWITCH_EVENT,
  type PortalBridgeSwitchDetail,
} from '@components/MainPage/PortalBridge';

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

const makeVirtualAnchor = (anchor: Anchor | null): VirtualElement => {
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
};

const getCyStyles = (theme: ReturnType<typeof useTheme>): Stylesheet[] => [
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
    selector: 'node.start',
    style: {
      'border-color': theme.palette.primary.main,
      'border-width': 8,
    },
  },
  {
    selector: 'node.current',
    style: {
      'border-color':
        theme.palette.error?.main ??
        theme.palette.primary.dark ??
        theme.palette.accent?.main ??
        '#d32f2f',
      'border-width': 10,
    },
  },
  {
    selector: 'node.selectable',
    style: {
      'border-color':
        theme.palette.node?.selectableConfig ?? theme.palette.accent?.main ?? theme.palette.secondary.main,
      'border-width': 10,
    },
  },
  {
    selector: 'node.ct-selected',
    style: {
      'border-color': theme.palette.primary.dark,
      'border-width': 11,
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
      width: 1.5,
      'line-color': theme.palette.grey[500],
      'target-arrow-color': theme.palette.grey[500],
      'target-arrow-shape': 'triangle',
      'arrow-scale': 1.1,
      'curve-style': 'bezier',
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
    selector: 'edge.hovered',
    style: {
      width: 3,
      'line-color': theme.palette.grey[700],
      'target-arrow-color': theme.palette.grey[700],
    },
  },
  {
    selector: 'edge.ct-selected',
    style: {
      width: 3.5,
      'line-color': theme.palette.primary.dark,
      'target-arrow-color': theme.palette.primary.dark,
    },
  },
  {
    selector: 'edge.ct-highlighted',
    style: {
      width: 3.5,
      'line-color': theme.palette.primary.main,
      'target-arrow-color': theme.palette.primary.main,
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
            showSelect
            onSelect={() => setConfiguration(data.config)}
            pendingInteractive
          />
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}

export function ConfigGraphCircles() {
  const theme = useTheme();
  const cyRef = useRef<CyCore | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ViewportSnapshot | null>(null);

  // Global Zustand states
  const configGraph = useGlobalZustand((s) => s.configGraph);
  const transitions = useGlobalZustand((s) => s.transitions);
  const stateColorMatching = useGlobalZustand((s) => s.stateColorMatching);
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);

  // Graph Zustand state and setters
  const configGraphNodeMode = useConfigGraphNodeMode();
  const setConfigGraphNodeMode = useGraphZustand((s) => s.setConfigGraphNodeMode);
  const configGraphELKSettings = useConfigGraphELKSettings();
  const setConfigGraphELKSettings = useGraphZustand(
    (s) => s.setConfigGraphELKSettings
  );

  const {
    selected,
    setSelected,
    hoveredState,
    setHoveredState,
    highlightedEdgeId,
  } = useGraphUI();
  const resolveColorForState = useCallback(
    (stateName?: string) => {
      const res = resolveStateColor(stateName, stateColorMatching);
      if (res === 'accept') return normalizeColor(theme.palette.success.light);
      if (res === 'reject') return normalizeColor(theme.palette.error.light);
      return normalizeColor(res);
    },
    [stateColorMatching, theme.palette.error.light, theme.palette.success.light]
  );

  const hoverTimerRef = useRef<number | null>(null);
  const nodePopperRef = useRef<NodePopperState>({ id: null, anchor: null, reason: null });
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
  const [containerVisible, setContainerVisible] = useState(true);

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

  // Base graph structure
  const [model, setModel] = useState<ConfigGraphModel | null>(null);
  const transitionsByState = useMemo(() => transitions, [transitions]);
  const base = useMemo(() => {
    if (!configGraph) return { nodes: [], edges: [], topoKey: '' };
    setModel(configGraph);
    return buildConfigGraph(
      configGraph,
      transitionsByState,
      undefined,
      ConfigNodeMode.CIRCLES
    );
  }, [configGraph, transitionsByState]);

  const [nodes, setNodes] = useState<RFNode[]>(base.nodes);
  const [edges, setEdges] = useState<RFEdge[]>(base.edges);
  const [structureKey, setStructureKey] = useState('');

  const nodeMapRef = useRef<Map<string, RFNode>>(new Map());
  const edgeMapRef = useRef<Map<string, RFEdge>>(new Map());

  useEffect(() => {
    nodeMapRef.current = new Map(nodes.map((n) => [n.id, n]));
  }, [nodes]);
  useEffect(() => {
    edgeMapRef.current = new Map(edges.map((e) => [e.id, e]));
  }, [edges]);

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
    topoKeyOverride: structureKey,
    autoRun: false,
    onLayout: (positions) => {
      setNodes((prev) =>
        prev.map((n) => {
          const p = positions.get(n.id);
          return p ? { ...n, position: p } : n;
        })
      );
    },
  });
  const scheduleLayoutRestart = useDebouncedLayoutRestart(layout);

  useEffect(() => {
    setConfigGraphELKSettings({
      ...configGraphELKSettings,
      edgeNodeSep: configGraphNodeMode === ConfigNodeMode.CARDS ? 300 : 100,
    });
  }, [configGraphNodeMode]);

  const didInitialLayoutRef = useRef(false);
  const lastTopoKeyRef = useRef<string | null>(null);
  const fitAfterLayoutRef = useRef(false);
  const prevRunningRef = useRef(layout.running);
  const pendingMachineLoadFitRef = useRef(false);

  // Disable cards if too many nodes
  const nodeCount = model?.Graph?.size ?? 0;
  const cardsDisabled = nodeCount > CARDS_LIMIT;

  useEffect(() => {
    if (configGraphNodeMode === ConfigNodeMode.CARDS && cardsDisabled) {
      setConfigGraphNodeMode(ConfigNodeMode.CIRCLES);
      toast.warning(
        `Cards are disabled when there are more than ${CARDS_LIMIT} nodes (current: ${nodeCount}).`
      );
    }
  }, [cardsDisabled, configGraphNodeMode, nodeCount, setConfigGraphNodeMode]);

  // Hide labels when many nodes
  const hideLabels = nodeCount >= COLOR_STATE_SWITCH;

  // Sync builder output
  useEffect(() => {
    if (!configGraph) return;

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
    configGraph,
    base.nodes,
    base.edges,
    base.topoKey,
    hideLabels,
    stateColorMatching,
  ]);

  // Topology key
  const topoKey = structureKey;

  // Layout triggers
  useEffect(() => {
    if (!didInitialLayoutRef.current && nodes.length > 0) {
      didInitialLayoutRef.current = true;
      scheduleLayoutRestart();
      fitAfterLayoutRef.current = true;
    }
  }, [nodes.length, scheduleLayoutRestart]);

  useEffect(() => {
    if (nodes.length === 0) return;
    if (lastTopoKeyRef.current === null) {
      lastTopoKeyRef.current = topoKey;
      return;
    }
    if (lastTopoKeyRef.current === topoKey) return;
    lastTopoKeyRef.current = topoKey;

    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [topoKey, nodes.length, scheduleLayoutRestart]);

  useEffect(() => {
    if (nodes.length === 0) return;
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [configGraphNodeMode, scheduleLayoutRestart, nodes.length]);

  // Fit view
  const runFitView = useCallback(
    (focusId?: string) => {
      const cy = cyRef.current;
      if (!cy) return;
      requestAnimationFrame(() => {
        cy.resize();
        if (focusId) {
          const ele = cy.getElementById(focusId);
          if (ele && ele.length > 0) {
            cy.fit(ele, 60);
            return;
          }
        }
        cy.fit(cy.elements(), 30);
      });
    },
    []
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
    pendingMachineLoadFitRef.current = !isContainerVisible();
    if (nodes.length === 0) return;
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [machineLoadVersion, scheduleLayoutRestart, nodes.length, isContainerVisible]);

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
        runFitView();
        if (isContainerVisible()) {
          pendingMachineLoadFitRef.current = false;
        }
      }
    }
    prevRunningRef.current = layout.running;
  }, [layout.running, nodes.length, runFitView, isContainerVisible]);

  // Event helpers
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

  const openNodePopper = useCallback((id: string, anchor: Anchor, reason: 'hover' | 'select') => {
    setNodePopper({ id, anchor, reason });
  }, []);

  const openEdgeTooltip = useCallback(
    (id: string, anchor: Anchor, reason: 'hover' | 'select') => {
      setEdgeTooltip({ id, anchor, reason });
    },
    []
  );

  const handleNodeTap = useCallback(
    (evt: EventObjectNode) => {
      evt.stopPropagation();
      clearHoverTimer();
      const id = evt.target.id();
      const anchor = getAnchorFromEvent(evt);
      setSelected({ type: 'node', id, anchor });
      setEdgeTooltip({ id: null, anchor: null, reason: null });
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
      setSelected({ type: 'edge', id, anchor });
      setNodePopper({ id: null, anchor: null, reason: null });
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

  // Selection + highlight class sync
  const lastSelectedRef = useRef<string | null>(null);
  const lastHighlightedRef = useRef<string | null>(null);

  // Cytoscape init
  const cyStyles = useMemo(() => getCyStyles(theme), [theme]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cy = cytoscape({
      container,
      elements: [],
      style: cyStyles,
      wheelSensitivity: 0.2,
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
      setSelected({ type: 'node', id, anchor });
      setNodePopper({ id, anchor, reason: 'select' });
    };
    const onEdgeTap = (evt: EventObjectEdge) => {
      evt.stopPropagation();
      clearHoverTimer();
      const id = evt.target.id();
      const anchor = getAnchorFromEvent(evt);
      setSelected({ type: 'edge', id, anchor });
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

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style(cyStyles);
    cy.style().update();
  }, [cyStyles]);

  // Sync elements into cy
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
        const displayLabel = data.showLabel === false ? '' : data.label ?? n.id;
        const stateColor =
          data.stateColor ?? resolveColorForState((n.data as any)?.config?.state);
        const bgColor =
          displayLabel === '' && stateColor
            ? stateColor
            : stateColor ?? theme.palette.background.paper;
        const classes = ['node'];
        if (data.isStart) classes.push('start');
        if (data.isCurrent) classes.push('current');
        if (data.isSelectable) classes.push('selectable');
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
            : data.isCurrent
              ? theme.palette.node?.currentConfig ?? theme.palette.primary.dark
              : data.isSelectable
                ? theme.palette.node?.selectableConfig ??
                  theme.palette.accent?.main ??
                  theme.palette.secondary.main
                : theme.palette.border?.main ?? theme.palette.divider,
          borderWidth: data.isStart ? 8 : 6,
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
        const cyData = {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label ?? '',
          transition: data.transition,
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
  }, [nodes, edges, theme, resolveColorForState]);

  // Selection + highlight class sync
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

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const prev = lastHighlightedRef.current;
    const next = highlightedEdgeId ?? null;
    if (prev === next) return;
    cy.batch(() => {
      if (prev) cy.getElementById(prev).removeClass('ct-highlighted');
      if (next) cy.getElementById(next).addClass('ct-highlighted');
    });
    lastHighlightedRef.current = next;
  }, [highlightedEdgeId]);

  // Resize observer
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
        runFitView();
        return;
      }
      restoreViewport();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [restoreViewport, runFitView, nodes.length, isContainerVisible]);

  // Portal switch fit
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
      if (!detail || detail.id !== 'configGraph') return;
      scheduleFitAfterSwitch();
    };
    window.addEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    return () => {
      window.removeEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    };
  }, [scheduleFitAfterSwitch]);

  // Legend items
  const legendItems = useMemo(() => {
    const entries = Array.from(stateColorMatching.entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([state, color]) => ({ key: state, color }));
  }, [stateColorMatching]);

  const showLegend = legendItems.length > 0 && (model?.Graph?.size ?? 0) > 0;

  const recalcLayout = useCallback(() => {
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [scheduleLayoutRestart]);

  const resetLayoutSettings = useCallback(() => {
    setConfigGraphELKSettings({
      ...DEFAULT_ELK_OPTS,
      edgeNodeSep: configGraphNodeMode === ConfigNodeMode.CARDS ? 300 : 100,
    });
  }, [configGraphNodeMode]);

  return (
    <Box
      id="ConfigGraph"
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
      <LayoutSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={configGraphELKSettings}
        onChange={(next) => setConfigGraphELKSettings(next)}
        onReset={resetLayoutSettings}
        onRecalc={recalcLayout}
        running={layout.running}
      />

      {/* Top-left controls */}
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
                  <ToggleButton value={ConfigNodeMode.CARDS} aria-label="card nodes" disabled>
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

      {/* Legend + fit */}
      <LegendPanel
        items={legendItems}
        visible={showLegend}
        hoveredKey={hoveredState}
        contentClassName="ct-scrollable"
        addon={
          <Tooltip title="Fit view">
            <span>
              <IconButton size="small" onClick={() => runFitView()}>
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
