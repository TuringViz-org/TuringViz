// src/components/ComputationTree/ComputationTree.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cytoscape, {
  type Core as CyCore,
  type EventObjectEdge,
  type EventObjectNode,
} from 'cytoscape';
import {
  Stack,
  Button,
  Tooltip,
  Box,
  Fab,
  Paper,
  Popper,
  ClickAwayListener,
  IconButton,
} from '@mui/material';
import { Cached, Tune, CenterFocusStrong } from '@mui/icons-material';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import type { VirtualElement } from '@popperjs/core';
import { toast } from 'sonner';
import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';

import { LegendPanel } from '@components/shared/LegendPanel';
import ConfigCard from '@components/ConfigGraph/ConfigVisualization/ConfigCard';
import { EdgeTooltip } from '@components/ConfigGraph/edges/EdgeTooltip';

import {
  CONFIG_CARD_WIDTH,
  CONFIG_NODE_DIAMETER,
  CONTROL_HEIGHT,
} from './util/constants';
import { COLOR_STATE_SWITCH } from '../ConfigGraph/util/constants';
import {
  getComputationTreeFromInputs,
  type ComputationTree as ComputationTreeModel,
} from '@tmfunctions/ComputationTree';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  useComputationTreeELKSettings,
  useGraphZustand,
} from '@zustands/GraphZustand';
import { buildComputationTreeGraph } from './util/buildComputationTree';
import {
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

function getCyStyles(theme: Theme) {
  return [
    {
      selector: 'core',
      style: {
        'active-bg-opacity': 0,
        'active-bg-size': 0,
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
  ] as any;
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
      <ClickAwayListener onClickAway={onClose} mouseEvent={false} touchEvent={false}>
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
  compressing: boolean
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
  }, [
    targetNodes,
    compressing,
    transitions,
    blank,
    numberOfTapes,
    startState,
    input,
  ]);

  useEffect(() => {
    if (!model) return;
    setBase(buildComputationTreeGraph(model, transitions, ConfigNodeMode.CIRCLES));
  }, [model, transitions]);

  return { model, base };
}

type Props = { targetNodes: number; compressing?: boolean };

function ComputationTreeView({ targetNodes, compressing = false }: Props) {
  const theme = useTheme();
  const cyRef = useRef<CyCore | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ViewportSnapshot | null>(null);

  const stateColorMatching = useGlobalZustand((s) => s.stateColorMatching);
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);
  const computationTreeELKSettings = useComputationTreeELKSettings();
  const setComputationTreeELKSettings = useGraphZustand(
    (s) => s.setComputationTreeELKSettings
  );
  const setComputationTreeNodeMode = useGraphZustand(
    (s) => s.setComputationTreeNodeMode
  );

  useEffect(() => {
    setComputationTreeNodeMode(ConfigNodeMode.CIRCLES);
  }, [setComputationTreeNodeMode]);

  const { selected, setSelected, hoveredState, setHoveredState } = useGraphUI();

  const { model, base } = useComputationTreeData(targetNodes, !!compressing);

  const [nodes, setNodes] = useState<RFNode[]>(base.nodes);
  const [edges, setEdges] = useState<RFEdge[]>(base.edges);
  const [structureKey, setStructureKey] = useState('');
  const [containerVisible, setContainerVisible] = useState(true);
  const [viewportReady, setViewportReady] = useState(false);

  const nodeMapRef = useRef<Map<string, RFNode>>(new Map());
  const edgeMapRef = useRef<Map<string, RFEdge>>(new Map());

  useEffect(() => {
    nodeMapRef.current = new Map(nodes.map((n) => [n.id, n]));
  }, [nodes]);
  useEffect(() => {
    edgeMapRef.current = new Map(edges.map((e) => [e.id, e]));
  }, [edges]);

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

  const nodeCount = model?.nodes?.length ?? 0;
  const hideLabels = nodeCount >= COLOR_STATE_SWITCH;

  const resolveColorForState = useCallback(
    (stateName?: string) => {
      const res = resolveStateColor(stateName, stateColorMatching);
      if (res === 'accept') return normalizeColor(theme.palette.success.light);
      if (res === 'reject') return normalizeColor(theme.palette.error.light);
      return normalizeColor(res);
    },
    [stateColorMatching, theme.palette.error.light, theme.palette.success.light]
  );

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
    resolveColorForState,
  ]);

  useEffect(() => {
    if (!didInitialLayoutRef.current && nodes.length > 0) {
      didInitialLayoutRef.current = true;
      awaitingInitialRevealRef.current = true;
      setViewportReady(false);
      scheduleLayoutRestart();
      fitAfterLayoutRef.current = true;
    }
  }, [nodes.length, scheduleLayoutRestart]);

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

  useEffect(() => {
    if (lastHandledMachineLoadRef.current === machineLoadVersion) return;
    pendingMachineLoadFitRef.current = !isContainerVisible();
    awaitingInitialRevealRef.current = true;
    setViewportReady(false);
    if (nodes.length === 0) return;
    lastHandledMachineLoadRef.current = machineLoadVersion;
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [machineLoadVersion, nodes.length, isContainerVisible, scheduleLayoutRestart]);

  const restoreViewport = useCallback(() => {
    const cy = cyRef.current;
    const viewport = viewportRef.current;
    if (!cy || !viewport) return;
    cy.viewport(viewport);
  }, []);

  useEffect(() => {
    const justFinished = prevRunningRef.current && !layout.running;
    if (justFinished && fitAfterLayoutRef.current && nodes.length > 0) {
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

    prevRunningRef.current = layout.running;
  }, [layout.running, nodes.length, runFitView, isContainerVisible]);

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

  useEffect(() => {
    if (selected.type === 'node' && selected.id) {
      const anchor = selected.anchor ?? getAnchorFromElement(selected.id);
      if (anchor) openNodePopper(selected.id, anchor, 'select');
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

    setNodePopper({ id: null, anchor: null, reason: null });
    setEdgeTooltip({ id: null, anchor: null, reason: null });
  }, [selected, getAnchorFromElement, openNodePopper, openEdgeTooltip]);

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
        !!nodePopperRef.current.id ||
        !!edgeTooltipRef.current.id ||
        settingsOpenRef.current;
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
        const displayLabel = data.showLabel === false ? '' : (data.label ?? n.id);
        const bgColor = stateColor ?? theme.palette.background.paper;
        const classes = ['node'];
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
            : (theme.palette.border?.main ?? theme.palette.divider),
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
  }, [nodes, edges, theme, resolveColorForState]);

  const lastSelectedRef = useRef<string | null>(null);
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
    const el = containerRef.current;
    if (!cy || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const visibleNow = isContainerVisible();
      setContainerVisible(visibleNow);
      cy.resize();
      if (pendingMachineLoadFitRef.current && nodes.length > 0 && visibleNow) {
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
    });
  }, [setComputationTreeELKSettings]);

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

      <TreeLayoutSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={computationTreeELKSettings}
        onChange={(next) => setComputationTreeELKSettings(next)}
        onReset={resetLayoutSettings}
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
        </Stack>
      </Box>

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

      <NodeDetailPopper
        node={nodePopper.id ? (nodeMapRef.current.get(nodePopper.id) ?? null) : null}
        anchor={nodePopper.anchor}
        open={containerVisible && !!nodePopper.id && !!nodePopper.anchor}
        onClose={() => {
          setSelected({ type: null, id: null });
          setNodePopper({ id: null, anchor: null, reason: null });
        }}
      />

      <EdgeTooltip
        open={containerVisible && !!edgeTooltip.id && !!edgeTooltip.anchor}
        anchorEl={makeVirtualAnchor(edgeTooltip.anchor)}
        transition={
          edgeTooltip.id
            ? (edgeMapRef.current.get(edgeTooltip.id)?.data as any)?.transition
            : undefined
        }
        isCompressed={
          edgeTooltip.id
            ? (edgeMapRef.current.get(edgeTooltip.id)?.data as any)?.compressed ===
              true
            : false
        }
        compressedLength={
          edgeTooltip.id
            ? (edgeMapRef.current.get(edgeTooltip.id)?.data as any)?.compressedLength
            : undefined
        }
        sourceLabel={
          edgeTooltip.id
            ? (
                nodeMapRef.current.get(
                  edgeMapRef.current.get(edgeTooltip.id)?.source ?? ''
                )?.data as any
              )?.label
            : undefined
        }
        targetLabel={
          edgeTooltip.id
            ? (
                nodeMapRef.current.get(
                  edgeMapRef.current.get(edgeTooltip.id)?.target ?? ''
                )?.data as any
              )?.label
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

export function ComputationTree(props: Props) {
  return <ComputationTreeView {...props} />;
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
    <GraphUIProvider key={machineLoadVersion}>
      <ComputationTree targetNodes={targetNodes} compressing={compressing} />
    </GraphUIProvider>
  );
}
