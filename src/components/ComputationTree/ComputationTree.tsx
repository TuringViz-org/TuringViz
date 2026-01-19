// src/components/ComputationTree/ComputationTree.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Stack,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Box,
  Fab,
} from '@mui/material';
import {
  Cached,
  Adjust,
  ViewAgenda,
  Tune,
  Add,
  Remove,
  CenterFocusStrong,
} from '@mui/icons-material';
import { alpha, useTheme } from '@mui/material/styles';
import { toast } from 'sonner';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';

import { LegendPanel } from '@components/shared/LegendPanel';
import {
  NodeType,
  CARDS_LIMIT,
  COLOR_STATE_SWITCH,
  CONTROL_HEIGHT,
  CONFIG_NODE_DIAMETER,
  CONFIG_CARD_WIDTH,
} from './util/constants';
import type { ComputationTree as TMComputationTree } from '@tmfunctions/ComputationTree';
import { getComputationTree } from '@tmfunctions/ComputationTree';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  useComputationTreeNodeMode,
  useComputationTreeELKSettings,
  useGraphZustand,
} from '@zustands/GraphZustand';
import { buildComputationTreeGraph, type CTNode, type CTEdge } from './util/buildComputationTree';
import { ConfigNodeMode, DEFAULT_ELK_OPTS } from '@utils/constants';
import { useElkLayout } from './layout/useElkLayout';
import { TreeLayoutSettingsPanel } from './layout/LayoutSettingsPanel';
import { useDebouncedLayoutRestart } from '@hooks/useDebouncedLayoutRestart';
import { GraphUIProvider, useGraphUI } from '@components/shared/GraphUIContext';
import {
  PORTAL_BRIDGE_SWITCH_EVENT,
  type PortalBridgeSwitchDetail,
} from '@components/MainPage/PortalBridge';
import { StaticConfigNode } from './nodes/StaticConfigNode';
import { StaticConfigCardNode } from './nodes/StaticConfigCardNode';
import { D3FloatingEdge } from './edges/D3FloatingEdge';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 2.2;

type Props = { depth: number; compressing?: boolean };

const nodeRenderer: Record<NodeType, typeof StaticConfigNode | typeof StaticConfigCardNode> = {
  [NodeType.CONFIG]: StaticConfigNode,
  [NodeType.CONFIG_CARD]: StaticConfigCardNode,
};

const shallowEqual = (a: any, b: any) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if ((a as any)[k] !== (b as any)[k]) return false;
  return true;
};

const reconcileNodes = (
  prev: CTNode[],
  base: CTNode[],
  makeData: (node: CTNode, old?: CTNode) => any
) => {
  const prevById = new Map(prev.map((n) => [n.id, n]));
  let changed = false;

  const next = base.map((n) => {
    const old = prevById.get(n.id);
    const data = makeData(n, old);

    if (old && old.type === n.type && shallowEqual(old.data, data)) {
      return old;
    }

    changed = true;
    return {
      ...n,
      position: old?.position ?? n.position,
      width: old?.width ?? n.width,
      height: old?.height ?? n.height,
      data,
    };
  });

  return changed ? next : prev;
};

const reconcileEdges = (prev: CTEdge[], base: CTEdge[]) => {
  const prevById = new Map(prev.map((e) => [e.id, e]));
  let changed = false;

  const next = base.map((e) => {
    const old = prevById.get(e.id);
    if (old && shallowEqual(old, e)) return old;
    changed = true;
    return e;
  });

  if (next.length !== prev.length) changed = true;
  return changed ? next : prev;
};

const computeBounds = (nodes: CTNode[]) => {
  if (!nodes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    const fallback = n.type === NodeType.CONFIG ? CONFIG_NODE_DIAMETER : CONFIG_CARD_WIDTH;
    const w = Math.max(1, n.width ?? fallback);
    const h = Math.max(1, n.height ?? fallback);
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  }

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

function ComputationTreeInner({ depth, compressing = false }: Props) {
  const theme = useTheme();
  // Global Zustand state
  const blank = useGlobalZustand((s) => s.blank);
  const transitions = useGlobalZustand((s) => s.transitions);
  const startState = useGlobalZustand((s) => s.startState);
  const stateColorMatching = useGlobalZustand((s) => s.stateColorMatching);

  // Graph Zustand state and setters
  const computationTreeNodeMode = useComputationTreeNodeMode();
  const setComputationTreeNodeMode = useGraphZustand(
    (s) => s.setComputationTreeNodeMode
  );
  const computationTreeELKSettings = useComputationTreeELKSettings();
  const setComputationTreeELKSettings = useGraphZustand(
    (s) => s.setComputationTreeELKSettings
  );

  const { selected, setSelected, hoveredState } = useGraphUI();

  // Base graph structure (nodes/edges) extraction
  const [model, setModel] = useState<TMComputationTree | null>(null);
  const base = useMemo(() => {
    const tree = getComputationTree(depth, !!compressing);
    setModel(tree);
    return buildComputationTreeGraph(tree, transitions, computationTreeNodeMode);
  }, [depth, computationTreeNodeMode, transitions, blank, startState, compressing]);

  const [nodes, setNodes] = useState<CTNode[]>(base.nodes);
  const [edges, setEdges] = useState<CTEdge[]>(base.edges);

  // Sync builder output into local state; keep previous size/data;
  useEffect(() => {
    if (!model) return;

    const nodeCount = model.nodes?.length ?? 0;
    const hideLabels = nodeCount >= COLOR_STATE_SWITCH;

    setNodes((prev) =>
      reconcileNodes(prev, base.nodes, (node) => {
        const stateName = (node.data as any)?.label ?? '';
        const mappedColor =
          stateColorMatching.get?.(stateName) ??
          stateColorMatching.get?.(String(stateName)) ??
          undefined;

        return {
          ...(node.data as any),
          showLabel: !hideLabels,
          stateColor: mappedColor,
        };
      })
    );

    setEdges((prev) => reconcileEdges(prev, base.edges));
  }, [model, base.nodes, base.edges, stateColorMatching]);

  // Layout
  const layout = useElkLayout({
    nodes,
    edges,
    algorithm: 'layered',
    nodeSep: computationTreeELKSettings.nodeSep,
    rankSep: computationTreeELKSettings.rankSep,
    edgeSep: computationTreeELKSettings.edgeSep,
    edgeNodeSep: computationTreeELKSettings.edgeNodeSep,
    padding: computationTreeELKSettings.padding,
    direction: computationTreeELKSettings.direction,
    onLayout: (posById) => {
      setNodes((prev) =>
        prev.map((n) => {
          const p = posById.get(n.id);
          return p ? { ...n, position: p } : n;
        })
      );
    },
  });
  const scheduleLayoutRestart = useDebouncedLayoutRestart(layout);

  // Adjust edgeNodeSep when node mode changes
  useEffect(() => {
    setComputationTreeELKSettings({
      ...computationTreeELKSettings,
      edgeNodeSep: computationTreeNodeMode === ConfigNodeMode.CARDS ? 300 : 100,
    });
  }, [computationTreeNodeMode]);

  const nodesCountRef = useRef(0);
  const edgesCountRef = useRef(0);
  useEffect(() => {
    nodesCountRef.current = nodes.length;
  }, [nodes.length]);
  useEffect(() => {
    edgesCountRef.current = edges.length;
  }, [edges.length]);

  const didInitialLayoutRef = useRef(false);
  const lastTopoKeyRef = useRef<string | null>(null);
  const fitAfterLayoutRef = useRef(false);
  const prevRunningRef = useRef(layout.running);
  const layoutRunningRef = useRef(layout.running);
  const manualFitPendingRef = useRef(false);

  useEffect(() => {
    layoutRunningRef.current = layout.running;
  }, [layout.running]);

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

  const topoKey = useMemo(() => {
    const nIds = nodes
      .map((n) => n.id)
      .sort()
      .join('|');
    const ePairs = Array.from(
      new Set(
        edges
          .filter((e) => e.source !== e.target)
          .map((e) => `${e.source}→${e.target}`)
      )
    )
      .sort()
      .join('|');
    return `${nIds}__${ePairs}`;
  }, [nodes, edges]);

  // D3 zoom / pan
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity.translate(0, 0).scale(0.1));
  const zoomRef = useRef<ZoomBehavior<Element, unknown> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const behavior = zoom<Element, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .on('zoom', (event) => {
        setTransform(event.transform);
      });

    zoomRef.current = behavior;
    select(el).call(behavior as any);

    return () => {
      select(el).on('.zoom', null);
    };
  }, []);

  const applyTransform = useCallback((next: ZoomTransform) => {
    const el = containerRef.current;
    const behavior = zoomRef.current;
    if (!el || !behavior) return;
    const sel = select(el);
    sel.call(behavior.transform as any, next);
  }, []);

  const runFitView = useCallback(() => {
    const bounds = computeBounds(nodes);
    if (!bounds) return;

    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const padding = 0.2;
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);

    const scale = Math.min(
      (rect.width * (1 - padding)) / width,
      (rect.height * (1 - padding)) / height
    );
    const clampedScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));

    const tx = rect.width / 2 - (bounds.minX + width / 2) * clampedScale;
    const ty = rect.height / 2 - (bounds.minY + height / 2) * clampedScale;
    const next = zoomIdentity.translate(tx, ty).scale(clampedScale);

    applyTransform(next);
  }, [nodes, applyTransform]);

  // Initial layout + fit
  useEffect(() => {
    if (!didInitialLayoutRef.current && nodes.length > 0) {
      didInitialLayoutRef.current = true;
      scheduleLayoutRestart();
      fitAfterLayoutRef.current = true;
    }
  }, [nodes.length, scheduleLayoutRestart]);

  // On topology change
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

  // On node mode change
  useEffect(() => {
    if (nodes.length === 0) return;
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [computationTreeNodeMode, scheduleLayoutRestart, nodes.length]);

  // Layout finished -> maybe fit
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

  // Handlers
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handlePaneClick = useCallback(() => {
    setSelected({ type: null, id: null });
    setSettingsOpen(false);
  }, [setSelected]);

  const recalcLayout = useCallback(() => {
    scheduleLayoutRestart();
    fitAfterLayoutRef.current = true;
  }, [scheduleLayoutRestart]);

  const zoomIn = useCallback(() => {
    const el = containerRef.current;
    const behavior = zoomRef.current;
    if (!el || !behavior) return;
    const sel = select(el);
    sel.call(behavior.scaleBy as any, 1.2);
  }, []);

  const zoomOut = useCallback(() => {
    const el = containerRef.current;
    const behavior = zoomRef.current;
    if (!el || !behavior) return;
    const sel = select(el);
    sel.call(behavior.scaleBy as any, 1 / 1.2);
  }, []);

  const scheduleFitAfterSwitch = useCallback(() => {
    if (nodesCountRef.current === 0) return;
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

  const showLegend =
    (model?.nodes?.length ?? 0) >= COLOR_STATE_SWITCH &&
    computationTreeNodeMode === ConfigNodeMode.CIRCLES;

  const handleNodeSize = useCallback(
    (id: string, size: { width: number; height: number }) => {
      setNodes((prev) => {
        let changed = false;
        const next = prev.map((n) => {
          if (n.id !== id) return n;
          if (n.width === size.width && n.height === size.height) return n;
          changed = true;
          return { ...n, width: size.width, height: size.height };
        });
        if (changed) {
          scheduleLayoutRestart();
          fitAfterLayoutRef.current = true;
          return next;
        }
        return prev;
      });
    },
    [scheduleLayoutRestart]
  );

  const backgroundStyle = useMemo(
    () => ({
      backgroundImage: `radial-gradient(circle at 1px 1px, ${alpha(theme.palette.text.disabled, 0.25)} 1px, transparent 0)`,
      backgroundSize: '24px 24px',
    }),
    [theme.palette.text.disabled]
  );

  return (
    <Box
      id="ComputationTree"
      ref={containerRef}
      onClick={handlePaneClick}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 360,
        overflow: 'hidden',
        ...backgroundStyle,
      }}
    >
      {/* SVG canvas for edges */}
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}
      >
        <defs>
          <marker
            id="ct-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.palette.text.secondary} />
          </marker>
        </defs>
        <g
          transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
          style={{ pointerEvents: 'all' }}
        >
          {edges.map((edge) => {
            const source = nodes.find((n) => n.id === edge.source);
            const target = nodes.find((n) => n.id === edge.target);
            if (!source || !target) return null;
            return (
              <D3FloatingEdge
                key={edge.id}
                edge={edge}
                source={source}
                target={target}
                markerId="ct-arrow"
              />
            );
          })}
        </g>
      </svg>

      {/* HTML layer for nodes */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
            transformOrigin: '0 0',
            pointerEvents: 'none',
            width: '100%',
            height: '100%',
          }}
        >
          {nodes.map((node) => {
            const Component = nodeRenderer[node.type] ?? StaticConfigNode;
            return (
              <Box
                key={node.id}
                sx={{
                  position: 'absolute',
                  left: node.position.x,
                  top: node.position.y,
                  pointerEvents: 'auto',
                }}
              >
                <Component id={node.id} data={node.data as any} onSize={handleNodeSize} />
              </Box>
            );
          })}
        </Box>
      </Box>

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
            onClick={(e) => {
              e.stopPropagation();
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

      {/* Layout settings panel */}
      <TreeLayoutSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={computationTreeELKSettings}
        onChange={(next) => setComputationTreeELKSettings(next)}
        onReset={() => {
          setComputationTreeELKSettings({
            ...DEFAULT_ELK_OPTS,
            edgeNodeSep:
              computationTreeNodeMode === ConfigNodeMode.CARDS ? 300 : 100,
          });
        }}
        onRecalc={recalcLayout}
        running={layout.running}
      />

      {/* Top-left controls panel (recalculate layout and node mode switch) */}
      <Box
        sx={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: (t) => t.zIndex.appBar + 1,
          pointerEvents: 'auto',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            size="small"
            variant="contained"
            onClick={(e) => {
              e.stopPropagation();
              recalcLayout();
            }}
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
      />

      {/* Zoom controls */}
      <Box
        sx={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          pointerEvents: 'auto',
          zIndex: (t) => t.zIndex.appBar + 1,
        }}
      >
        <Fab size="small" color="primary" onClick={(e) => { e.stopPropagation(); zoomIn(); }}>
          <Add />
        </Fab>
        <Fab size="small" color="primary" onClick={(e) => { e.stopPropagation(); zoomOut(); }}>
          <Remove />
        </Fab>
        <Fab size="small" color="primary" onClick={(e) => { e.stopPropagation(); runFitView(); }}>
          <CenterFocusStrong />
        </Fab>
      </Box>
    </Box>
  );
}

export function ComputationTreeWrapper({
  depth = 10,
  compressing = false,
}: {
  depth?: number;
  compressing?: boolean;
}) {
  return (
    <GraphUIProvider>
      <ComputationTreeInner depth={depth} compressing={compressing} />
    </GraphUIProvider>
  );
}
