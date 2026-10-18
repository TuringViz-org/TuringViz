import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape, { type Core as CyCore } from 'cytoscape';
import { Box } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { GraphUIProvider, useGraphUI } from '@components/shared/GraphUIContext';
import { syncCytoscapeElements } from '@components/shared/cytoscapeElements';
import { useCytoscapeClass } from '@components/shared/useCytoscapeClass';
import { LoadingOverlay } from '@components/shared/LoadingOverlay';
import { useTMGraphData, useHighlightedTransition } from './hooks/useTMGraphData';
import { useTMGraphInteractions } from './hooks/useTMGraphInteractions';
import { useTMGraphViewport } from './hooks/useTMGraphViewport';
import { getTMGraphStyles } from './rendering/styles';
import { buildTMCytoscapeElements } from './rendering/elements';
import { TMGraphControls } from './TMGraphControls';

function TMGraph() {
  const theme = useTheme();
  const states = useGlobalZustand((s) => s.states);
  const transitions = useGlobalZustand((s) => s.transitions);
  const startState = useGlobalZustand((s) => s.startState);
  const currentState = useGlobalZustand((s) => s.currentState);
  const lastState = useGlobalZustand((s) => s.lastState);
  const lastTransition = useGlobalZustand((s) => s.lastTransition);
  const lastTransitionTrigger = useGlobalZustand((s) => s.lastTransitionTrigger);
  const runSpeedMs = useGlobalZustand((s) => s.runSpeedMs);

  const { highlightedEdgeId, setHighlightedEdgeId } = useGraphUI();

  const { nodes, edges, setNodes, topoKey, expectedNodeKey, expectedEdgeKey } =
    useTMGraphData({
      states,
      transitions,
      startState,
      currentState,
      lastState,
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
  const [containerVisible, setContainerVisible] = useState(true);
  const {
    bindEvents,
    syncSelectionClass,
    refreshSelectedEdgeTooltipAnchor,
    settingsOpen,
    setSettingsOpen,
    popovers,
  } = useTMGraphInteractions({
    cyRef,
    containerRef,
    edges,
    setNodes,
    containerVisible,
  });
  const {
    viewportReady,
    running,
    runFitView,
    recalcLayout,
    zoomBy,
    clearPendingFit,
    observeContainer,
  } = useTMGraphViewport({
    cyRef,
    containerRef,
    nodes,
    edges,
    setNodes,
    topoKey,
    expectedNodeKey,
    expectedEdgeKey,
    setContainerVisible,
    refreshSelectedEdgeTooltipAnchor,
  });
  const cyStyles = useMemo(() => getTMGraphStyles(theme), [theme]);
  const initialCyStylesRef = useRef(cyStyles);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cy = cytoscape({
      container,
      elements: [],
      style: initialCyStylesRef.current,
      minZoom: 0.01,
      maxZoom: 2.5,
    });

    cy.boxSelectionEnabled(false);
    cy.userPanningEnabled(true);
    cy.userZoomingEnabled(true);
    cy.autoungrabify(false);
    cy.zoom(1);
    cy.center();

    const unbindEvents = bindEvents(cy);
    cyRef.current = cy;
    return () => {
      unbindEvents();
      clearPendingFit();
      cy.destroy();
      cyRef.current = null;
    };
  }, [bindEvents, clearPendingFit]);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy) cy.style(cyStyles).update();
  }, [cyStyles]);
  useEffect(() => {
    const cy = cyRef.current;
    if (cy) syncCytoscapeElements(cy, buildTMCytoscapeElements(nodes, edges, theme));
  }, [nodes, edges, theme]);
  useEffect(syncSelectionClass, [syncSelectionClass]);
  useCytoscapeClass(cyRef, highlightedEdgeId, 'tm-highlighted');
  useEffect(observeContainer, [observeContainer]);
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
          transition: 'none',
        }}
      />

      {!viewportReady && <LoadingOverlay />}

      <TMGraphControls
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        running={running}
        recalcLayout={recalcLayout}
        runFitView={runFitView}
        zoomBy={zoomBy}
      />
      {popovers}
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
