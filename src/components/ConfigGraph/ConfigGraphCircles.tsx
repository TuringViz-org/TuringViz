import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape, { type Core as CyCore } from 'cytoscape';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useGraphUI } from '@components/shared/GraphUIContext';
import { useCytoscapeGraphInteractions } from '@components/shared/useCytoscapeGraphInteractions';
import { syncCytoscapeElements } from '@components/shared/cytoscapeElements';
import { useCytoscapeClass } from '@components/shared/useCytoscapeClass';
import { LegendPanel } from '@components/shared/LegendPanel';
import { LoadingOverlay } from '@components/shared/LoadingOverlay';
import { ConfigGraphControls } from './ConfigGraphControls';
import { getConfigGraphStyles } from './rendering/styles';
import { buildConfigCytoscapeElements } from './rendering/elements';
import { useConfigGraphCircleData } from './hooks/useConfigGraphCircleData';
import { useConfigGraphCircleViewport } from './hooks/useConfigGraphCircleViewport';

export function ConfigGraphCircles({ active = true }: { active?: boolean }) {
  const theme = useTheme();
  const cyRef = useRef<CyCore | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerVisible, setContainerVisible] = useState(true);
  const { hoveredState, highlightedEdgeId } = useGraphUI();
  const data = useConfigGraphCircleData(active);
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
    nodes: data.nodes,
    edges: data.edges,
    pendingInteractive: true,
  });
  const viewport = useConfigGraphCircleViewport({
    data,
    active,
    cyRef,
    containerRef,
    setContainerVisible,
    refreshSelectedAnchors,
  });
  const { saveViewport } = viewport;
  // Cytoscape init
  const cyStyles = useMemo(() => getConfigGraphStyles(theme), [theme]);
  const initialCyStylesRef = useRef(cyStyles);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cy = cytoscape({
      container,
      webgl: true,
      elements: [],
      style: initialCyStylesRef.current,
      minZoom: 0.01,
      maxZoom: 2.5,
    });

    cy.boxSelectionEnabled(false);
    cy.userPanningEnabled(true);
    cy.userZoomingEnabled(true);
    cy.autoungrabify(true);
    cy.zoom(0.1);
    cy.center();
    cyRef.current = cy;
    saveViewport();
    const unbindEvents = bindEvents(cy);
    const onViewportChanged = () => {
      saveViewport();
      refreshSelectedAnchors();
    };
    cy.on('pan zoom', onViewportChanged);
    return () => {
      unbindEvents();
      cy.off('pan zoom', onViewportChanged);
      cy.destroy();
      cyRef.current = null;
    };
  }, [bindEvents, saveViewport, refreshSelectedAnchors]);
  useEffect(() => {
    const cy = cyRef.current;
    if (cy) cy.style(cyStyles).update();
  }, [cyStyles]);

  const lastNodes = useRef(data.nodes);
  const lastEdges = useRef(data.edges);
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (data.nodes.length > 0) lastNodes.current = data.nodes;
    if (data.edges.length > 0) lastEdges.current = data.edges;
    syncCytoscapeElements(
      cy,
      buildConfigCytoscapeElements(
        data.nodes.length > 0 ? data.nodes : lastNodes.current,
        data.edges.length > 0 ? data.edges : lastEdges.current,
        theme,
        data.resolveColorForState
      )
    );
    cy.nodes().ungrabify();
  }, [data.nodes, data.edges, theme, data.resolveColorForState]);
  useEffect(syncSelectionClass, [syncSelectionClass]);
  useCytoscapeClass(cyRef, highlightedEdgeId, 'ct-highlighted');
  useEffect(viewport.observeContainer, [viewport.observeContainer]);
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
          opacity: viewport.showLoadingOverlay ? 0 : 1,
          pointerEvents: viewport.showLoadingOverlay ? 'none' : 'auto',
          transition: viewport.showLoadingOverlay ? 'none' : 'opacity 120ms ease',
        }}
      />

      {viewport.showLoadingOverlay && (
        <LoadingOverlay
          label={
            viewport.configGraphComputing
              ? 'Computing graph...'
              : 'Calculating layout...'
          }
        />
      )}

      <ConfigGraphControls
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        showLoadingOverlay={viewport.showLoadingOverlay}
        running={viewport.running}
        onFit={() => viewport.runFitView()}
        onReset={viewport.resetLayoutSettings}
        onRecalc={viewport.recalcLayout}
      />

      {/* Legend + fit */}
      <LegendPanel
        items={data.legendItems}
        visible={data.showLegend}
        hoveredKey={hoveredState}
        contentClassName="ct-scrollable"
      />

      {popovers}
    </Box>
  );
}
