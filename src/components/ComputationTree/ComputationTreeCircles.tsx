import { useEffect, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { Node, Edge } from '@xyflow/react';
import cytoscape, { type Core as CyCore } from 'cytoscape';
import type { ConfigNodeData, ConfigEdgeData } from '@components/ConfigGraph/types';
import { LoadingOverlay } from '@components/shared/LoadingOverlay';
import { useCytoscapeGraphInteractions } from '@components/shared/useCytoscapeGraphInteractions';
import { syncCytoscapeElements } from '@components/shared/cytoscapeElements';
import { TreeControls } from './TreeControls';
import type { ViewProps } from './types';
import { useTreeColors } from './useTreePresentation';
import { useTreeCircleLayout } from './useTreeCircleLayout';
import { useTreeCircleViewport } from './useTreeCircleViewport';
import type { CytoscapeViewport } from '@components/shared/cytoscapeViewport';
import { buildTreeCircleElements } from './rendering/elements';
import { getCyStyles } from './util/cytoscapeStyles';

export function ComputationTreeCircles({
  treeData,
  paused = false,
  active = true,
}: ViewProps) {
  const theme = useTheme();
  const cyRef = useRef<CyCore | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<CytoscapeViewport | null>(null);
  const resolveColorForState = useTreeColors();
  const {
    nodes,
    edges,
    nodeCount,
    computationTreeNodeMode,
    containerVisible,
    loadingMaskVisible,
    isComputing,
    runFitView,
    recalcLayout,
    onPositionsApplied,
    observation,
  } = useTreeCircleLayout({
    cyRef,
    containerRef,
    viewportRef,
    treeData,
    paused,
    active,
  });
  const {
    bindEvents,
    syncSelectionClass,
    refreshSelectedAnchors,
    settingsOpen,
    setSettingsOpen,
    popovers,
  } = useCytoscapeGraphInteractions({
    cyRef,
    containerRef,
    containerVisible,
    nodes,
    edges,
    pendingInteractive: false,
  });
  // Instantiate Cytoscape once
  const cyStyles = useMemo(() => getCyStyles(theme), [theme]);
  const initialCyStyles = useRef(cyStyles);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cy = cytoscape({
      container,
      webgl: true,
      elements: [],
      style: initialCyStyles.current,
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

    const onViewportChanged = () => {
      viewportRef.current = {
        zoom: cy.zoom(),
        pan: { ...cy.pan() },
      };
      refreshSelectedAnchors();
    };

    const unbindEvents = bindEvents(cy);
    cy.on('pan zoom', onViewportChanged);

    cyRef.current = cy;
    return () => {
      unbindEvents();
      cy.off('pan zoom', onViewportChanged);
      cy.destroy();
      cyRef.current = null;
    };
  }, [bindEvents, refreshSelectedAnchors]);

  // Update styles if theme changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style(cyStyles);
    cy.style().update();
  }, [cyStyles]);

  const lastNonEmptyNodesRef = useRef<Node<ConfigNodeData>[]>([]);
  const lastNonEmptyEdgesRef = useRef<Edge<ConfigEdgeData>[]>([]);

  // Sync nodes/edges into Cytoscape
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (nodes.length > 0) lastNonEmptyNodesRef.current = nodes;
    if (edges.length > 0) lastNonEmptyEdgesRef.current = edges;

    const nodesForSync = nodes.length > 0 ? nodes : lastNonEmptyNodesRef.current;
    const edgesForSync = edges.length > 0 ? edges : lastNonEmptyEdgesRef.current;

    syncCytoscapeElements(
      cy,
      buildTreeCircleElements(
        nodesForSync,
        edgesForSync,
        theme,
        computationTreeNodeMode,
        resolveColorForState
      )
    );

    cy.nodes().ungrabify();
    onPositionsApplied();
  }, [
    nodes,
    edges,
    computationTreeNodeMode,
    theme,
    resolveColorForState,
    onPositionsApplied,
  ]);

  useEffect(syncSelectionClass, [syncSelectionClass]);

  useTreeCircleViewport({
    cyRef,
    containerRef,
    observation,
    refreshSelectedAnchors,
  });

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
        <LoadingOverlay
          label={isComputing ? 'Computing tree...' : 'Calculating layout...'}
        />
      )}

      <TreeControls
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
        onFit={() => runFitView()}
        fitDisabled={loadingMaskVisible}
        onRecalc={recalcLayout}
        running={observation.layout.running}
        nodeCount={nodeCount}
      />

      {popovers}
    </Box>
  );
}
