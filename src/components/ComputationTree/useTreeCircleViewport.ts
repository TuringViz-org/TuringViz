import { useCallback, useEffect } from 'react';
import { useGraphFrameTask } from '@hooks/useGraphFrameTask';
import {
  PORTAL_BRIDGE_SWITCH_EVENT,
  type PortalBridgeSwitchDetail,
} from '@components/MainPage/PortalBridge';
import type { useTreeCircleLayout, RendererRefs } from './useTreeCircleLayout';

type LayoutObservation = ReturnType<typeof useTreeCircleLayout>['observation'];

/** Hidden tabs defer fitting; portal moves preserve the existing pan and zoom. */
export function useTreeCircleViewport({
  cyRef,
  containerRef,
  refreshSelectedAnchors,
  observation,
}: Omit<RendererRefs, 'viewportRef'> & {
  refreshSelectedAnchors: () => void;
  observation: LayoutObservation;
}) {
  const {
    base,
    nodes,
    layout,
    viewportReady,
    setContainerVisible,
    setAutoResizeLayoutEnabled,
    isContainerVisible,
    pendingMachineLoadFitRef,
    awaitingInitialRevealRef,
    pendingRevealFitRef,
    fitAfterLayoutRef,
    pendingLayoutViewportFitRef,
    skipNextAutoResizeFitRef,
    runFitView,
    revealViewport,
    restoreViewport,
    scheduleLayoutRestart,
  } = observation;
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
      if (pendingMachineLoadFitRef.current && nodes.length > 0 && visibleNow) {
        pendingMachineLoadFitRef.current = false;
        runFitView(() => {
          if (awaitingInitialRevealRef.current) {
            revealViewport();
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
            revealViewport();
          }
          refreshSelectedAnchors();
        });
        return;
      }
      // Container just became visible while still in loading state — layout
      // was never run because runLayout early-returned on zero dimensions.
      // Re-trigger the full layout + fit cycle now.
      if (
        justBecameVisible &&
        !viewportReady &&
        !layout.running &&
        nodes.length > 0
      ) {
        awaitingInitialRevealRef.current = true;
        fitAfterLayoutRef.current = true;
        pendingLayoutViewportFitRef.current = true;
        scheduleLayoutRestart();
        return;
      }
      if (
        layout.running ||
        fitAfterLayoutRef.current ||
        pendingLayoutViewportFitRef.current
      ) {
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
    revealViewport,
  ]);

  // Portal switch fit handling
  const { schedule: schedulePortalTask } = useGraphFrameTask([base.topoKey]);
  const scheduleFitAfterSwitch = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    schedulePortalTask(() => {
      if (cyRef.current !== cy || cy.destroyed()) return;
      cy.resize();
      setContainerVisible(isContainerVisible());
      restoreViewport();
      refreshSelectedAnchors();
    }, 1);
  }, [
    restoreViewport,
    isContainerVisible,
    refreshSelectedAnchors,
    schedulePortalTask,
  ]);

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
}
