import { useGraphReveal } from '@hooks/useGraphReveal';
import { ConfigGraphControls } from './ConfigGraphControls';
import { useGraphLayoutRequest } from '@hooks/useGraphLayoutRequest';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  useNodesInitialized,
  useStore,
  MarkerType,
  Background,
  type ReactFlowState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

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
import { NodeType, EdgeType, COLOR_STATE_SWITCH } from './util/constants';
import { useElkLayout } from './layout/useElkLayout';
import { buildConfigGraph } from './util/buildConfigGraph';
import { useDebouncedLayoutRestart } from '@hooks/useDebouncedLayoutRestart';
import {
  ConfigNodeMode,
  DEFAULT_GRAPH_CARDS_ELK_OPTS,
  DEFAULT_GRAPH_ELK_OPTS,
  DEFAULT_GRAPH_NODES_ELK_OPTS,
} from '@utils/constants';
import { reconcileNodes, reconcileEdges } from '@utils/reactflow';
import { useGraphUI } from '@components/shared/GraphUIContext';
import { LoadingOverlay } from '@components/shared/LoadingOverlay';
import { normalizeColor, resolveStateColor } from '@components/shared/stateColors';
import { useGraphCurrentConfiguration } from '@hooks/useGraphCurrentConfiguration';
import { useCurrentConfigHighlight } from '@hooks/useCurrentConfigHighlight';
import {
  useCardGraphViewport,
  useCardViewportState,
} from '@hooks/useCardGraphViewport';
import { useCardGraphSelection } from '@hooks/useCardGraphSelection';

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

function reportViewportError(operation: 'fit' | 'restore', error: unknown) {
  console.warn(`Configuration graph viewport ${operation} failed`, error);
}
export function ConfigGraphCards({ active }: { active: boolean }) {
  const theme = useTheme();
  const configGraph = useGlobalZustand((s) => s.configGraph);
  const transitions = useGlobalZustand((s) => s.transitions);
  const stateColorMatching = useGlobalZustand((s) => s.stateColorMatching);
  const configGraphVersion = useGlobalZustand((s) => s.configGraphVersion);
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);
  const configGraphComputing = useGlobalZustand((s) => s.configGraphComputing);
  const currentConfig = useGraphCurrentConfiguration(active);

  const configGraphNodeMode = useConfigGraphNodeMode();
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewport = useCardViewportState();
  // Base graph structure (nodes/edges) extraction
  // ELK will overwrite positions
  const structure = useMemo(() => {
    if (!configGraph) return { nodes: [], edges: [], topoKey: '' };
    return buildConfigGraph(configGraph, transitions, null, configGraphNodeMode);
  }, [configGraph, transitions, configGraphNodeMode, configGraphVersion]);
  const base = useCurrentConfigHighlight(structure, currentConfig);

  const [nodes, setNodes, onNodesChangeRF] = useNodesState(base.nodes);
  const [edges, setEdges, onEdgesChangeRF] = useEdgesState(base.edges);
  const [structureKey, setStructureKey] = useState('');

  const { hoveredState } = useGraphUI();
  const selection = useCardGraphSelection();

  const nodesReady = useNodesInitialized();
  const viewportWidth = useStore((s: ReactFlowState) => s.width);
  const viewportHeight = useStore((s: ReactFlowState) => s.height);
  const { requestRestoreAfterLayout } = viewport;
  const handleAutoResizeLayout = useCallback(() => {
    if (nodes.length > 0) requestRestoreAfterLayout();
  }, [nodes.length, requestRestoreAfterLayout]);

  const layout = useElkLayout({
    nodes,
    edges,
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
    viewportWidth,
    viewportHeight,
    topoKeyOverride: structureKey,
    autoRun: false,
    autoResizeLayoutEnabled: active && viewport.autoResizeLayoutEnabled,
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

  // Sync builder output into RF state; keep previous size/data; ELK will set positions afterwards
  useEffect(() => {
    const nodeCount = base.nodes.length;
    const topologyChanged = base.topoKey !== structureKey;
    if (topologyChanged) {
      viewport.invalidate();
    }

    // If too many nodes, hide labels and only show colors
    const hideLabels = nodeCount >= COLOR_STATE_SWITCH;

    setNodes((prev) =>
      reconcileNodes(prev, base.nodes, (n) => {
        const data = n.data;
        const stateName = data.config?.state;
        const mappedColor = resolveColorForState(stateName);

        return {
          ...data,
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
    structureKey,
    stateColorMatching,
    resolveColorForState,
    setNodes,
    setEdges,
    viewport.invalidate,
  ]);

  const structureSyncPending = base.topoKey !== structureKey;
  const showLoadingOverlay =
    !viewport.ready ||
    layout.running ||
    configGraphComputing ||
    structureSyncPending;
  const loadingMaskVisible = !useGraphReveal(showLoadingOverlay);

  useGraphLayoutRequest(
    JSON.stringify([
      machineLoadVersion,
      configGraphNodeMode,
      structureKey,
      nodes.length,
    ]),
    nodesReady && nodes.length > 0 && !structureSyncPending,
    viewport.prepareLayout,
    scheduleLayoutRestart
  );
  const { fit: runFitView, onMoveEnd: handleMoveEnd } = useCardGraphViewport({
    state: viewport,
    portalId: 'configGraph',
    containerRef,
    active,
    nodeCount: nodes.length,
    nodesReady,
    layout,
    viewportWidth,
    viewportHeight,
    scopeDependencies: [machineLoadVersion, base.topoKey],
    retryHiddenRestore: true,
    onError: reportViewportError,
  });

  // Manual ELK restart via button; fit handled by running->idle effect
  const recalcLayout = useCallback(() => {
    scheduleLayoutRestart();
    viewport.requestFitAfterLayout();
  }, [scheduleLayoutRestart, viewport.requestFitAfterLayout]);

  const resetToDefaults = useCallback(() => {
    setConfigGraphELKSettings({
      ...(configGraphNodeMode === ConfigNodeMode.CARDS
        ? DEFAULT_GRAPH_CARDS_ELK_OPTS
        : DEFAULT_GRAPH_ELK_OPTS),
    });
  }, [configGraphNodeMode, setConfigGraphELKSettings]);

  const legendItems = useMemo(() => {
    const entries = Array.from(stateColorMatching.entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([state, color]) => ({ key: state, color }));
  }, [stateColorMatching]);

  const showLegend = legendItems.length > 0 && (configGraph?.Graph.size ?? 0) > 0;

  return (
    <Box
      ref={containerRef}
      sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 360 }}
    >
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
        onPaneClick={selection.onPaneClick}
        onNodeClick={selection.onNodeClick}
        onEdgeClick={selection.onEdgeClick}
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
        <ConfigGraphControls
          settingsOpen={selection.settingsOpen}
          setSettingsOpen={selection.setSettingsOpen}
          showLoadingOverlay={loadingMaskVisible}
          running={layout.running}
          onFit={() => runFitView()}
          onReset={resetToDefaults}
          onRecalc={recalcLayout}
        />

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
          label={
            configGraphComputing ? 'Computing graph...' : 'Calculating layout...'
          }
        />
      )}
    </Box>
  );
}
