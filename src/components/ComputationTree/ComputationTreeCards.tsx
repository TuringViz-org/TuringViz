import { useCallback, useRef } from 'react';
import { Box } from '@mui/material';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { ConfigNodeMode } from '@utils/constants';
import { useCardGraphSelection } from '@hooks/useCardGraphSelection';
import { LoadingOverlay } from '@components/shared/LoadingOverlay';
import { useDebouncedLayoutRestart } from '@hooks/useDebouncedLayoutRestart';
import { useGraphLayoutRequest } from '@hooks/useGraphLayoutRequest';
import {
  useCardGraphViewport,
  useCardViewportState,
} from '@hooks/useCardGraphViewport';
import { useGraphReveal } from '@hooks/useGraphReveal';
import { useElkLayout } from './layout/useElkLayout';
import { TreeControls } from './TreeControls';
import type { ViewProps } from './types';
import { useTreeSettings, useTreeStructure } from './useTreePresentation';
import {
  ReactFlow,
  useNodesInitialized,
  useStore,
  MarkerType,
  Background,
  type ReactFlowState,
} from '@xyflow/react';
import { ConfigNode } from '@components/ConfigGraph/nodes/ConfigNode';
import { ConfigCardNode } from '@components/ConfigGraph/nodes/ConfigCardNode';
import { FloatingEdge } from '@components/ConfigGraph/edges/FloatingEdge';
import { NodeType, EdgeType } from './util/constants';
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

export function ComputationTreeCards({
  treeData,
  paused = false,
  active = true,
}: ViewProps) {
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { nodeMode: computationTreeNodeMode, settings: computationTreeELKSettings } =
    useTreeSettings();

  const selection = useCardGraphSelection();

  const { base, isComputing } = treeData;

  const viewport = useCardViewportState(base.topoKey);
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    structureKey,
    nodeCount,
    structureSyncPending,
    applyPositions,
  } = useTreeStructure(treeData, viewport.invalidate);
  const { requestRestoreAfterLayout } = viewport;
  const handleAutoResizeLayout = useCallback(() => {
    if (nodes.length > 0) requestRestoreAfterLayout();
  }, [nodes.length, requestRestoreAfterLayout]);

  const nodesReady = useNodesInitialized();
  const viewportWidth = useStore((s: ReactFlowState) => s.width);
  const viewportHeight = useStore((s: ReactFlowState) => s.height);

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
    autoResizeLayoutEnabled: active && !paused && viewport.autoResizeLayoutEnabled,
    onAutoResizeLayout: handleAutoResizeLayout,
    onLayout: applyPositions,
  });
  const scheduleLayoutRestart = useDebouncedLayoutRestart(layout);

  const showLoadingOverlay =
    !viewport.ready || layout.running || isComputing || structureSyncPending;
  const loadingMaskVisible = !useGraphReveal(showLoadingOverlay);

  useGraphLayoutRequest(
    JSON.stringify([structureKey, computationTreeNodeMode, machineLoadVersion]),
    !paused && nodesReady && nodes.length > 0,
    viewport.prepareLayout,
    scheduleLayoutRestart
  );
  const { fit: runFitView, onMoveEnd: handleMoveEnd } = useCardGraphViewport({
    state: viewport,
    portalId: 'computationTree',
    containerRef,
    active,
    nodeCount: nodes.length,
    nodesReady,
    layout,
    viewportWidth,
    viewportHeight,
    scopeDependencies: [base.topoKey],
    requireStoreDimensions: true,
  });

  const recalcLayout = useCallback(() => {
    scheduleLayoutRestart();
    viewport.requestFitAfterLayout();
  }, [scheduleLayoutRestart, viewport.requestFitAfterLayout]);

  return (
    <Box
      ref={containerRef}
      sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 360 }}
    >
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
        onPaneClick={selection.onPaneClick}
        onNodeClick={selection.onNodeClick}
        onEdgeClick={selection.onEdgeClick}
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
        <TreeControls
          settingsOpen={selection.settingsOpen}
          onSettingsOpenChange={selection.setSettingsOpen}
          onFit={() => runFitView()}
          fitDisabled={loadingMaskVisible}
          onRecalc={recalcLayout}
          running={layout.running}
          nodeCount={nodeCount}
        />

        <Background gap={10} size={1} />
      </ReactFlow>

      {loadingMaskVisible && (
        <LoadingOverlay
          label={isComputing ? 'Computing tree...' : 'Calculating layout...'}
        />
      )}
    </Box>
  );
}
