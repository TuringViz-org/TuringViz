import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DependencyList,
  type RefObject,
} from 'react';
import { useReactFlow, type Viewport } from '@xyflow/react';
import {
  PORTAL_BRIDGE_BEFORE_SWITCH_EVENT,
  PORTAL_BRIDGE_SWITCH_EVENT,
  type PortalBridgeSwitchDetail,
} from '@components/MainPage/PortalBridge';
import { useGraphFrameTask } from './useGraphFrameTask';

/** Structural changes and resize layouts declare their viewport work before ELK runs. */
export function useCardViewportState(topologyKey?: string) {
  const [visible, setVisible] = useState(false);
  const [readyTopologyKey, setReadyTopologyKey] = useState<string>();
  const [autoResizeLayoutEnabled, setAutoResizeLayoutEnabled] = useState(true);
  const settled = useRef(false);
  const pending = useRef({ fit: false, restore: false, initialReveal: false });

  const mask = useCallback(() => setVisible(false), []);
  const invalidate = useCallback(() => {
    pending.current.initialReveal = true;
    settled.current = false;
    setVisible(false);
  }, []);
  const reveal = useCallback(() => {
    settled.current = true;
    setReadyTopologyKey(topologyKey);
    setVisible(true);
  }, [topologyKey]);
  const requestFitAfterLayout = useCallback(() => {
    pending.current.fit = true;
  }, []);
  const requestRestoreAfterLayout = useCallback(() => {
    pending.current.restore = true;
  }, []);
  const prepareLayout = useCallback(() => {
    invalidate();
    requestFitAfterLayout();
  }, [invalidate, requestFitAfterLayout]);

  return {
    ready: visible && readyTopologyKey === topologyKey,
    autoResizeLayoutEnabled,
    setAutoResizeLayoutEnabled,
    settled,
    pending,
    mask,
    invalidate,
    reveal,
    prepareLayout,
    requestFitAfterLayout,
    requestRestoreAfterLayout,
  };
}

type CardViewportState = ReturnType<typeof useCardViewportState>;

type Options = {
  state: CardViewportState;
  portalId: 'configGraph' | 'computationTree';
  containerRef: RefObject<HTMLDivElement | null>;
  active: boolean;
  nodeCount: number;
  nodesReady: boolean;
  layout: { running: boolean; completedLayouts: number };
  viewportWidth: number;
  viewportHeight: number;
  scopeDependencies: DependencyList;
  /** Tree cards also wait for React Flow's stored dimensions before fitting. */
  requireStoreDimensions?: boolean;
  /** Configuration cards retry a restore that starts while its container is hidden. */
  retryHiddenRestore?: boolean;
  onError?: (operation: 'fit' | 'restore', error: unknown) => void;
};

/** Owns the shared card fit, restore, visibility and fullscreen lifecycle. */
export function useCardGraphViewport({
  state,
  portalId,
  containerRef,
  active,
  nodeCount,
  nodesReady,
  layout,
  viewportWidth,
  viewportHeight,
  scopeDependencies,
  requireStoreDimensions = false,
  retryHiddenRestore = false,
  onError,
}: Options) {
  const { settled, pending, mask, reveal, setAutoResizeLayoutEnabled } = state;
  const rf = useReactFlow();
  const viewportTask = useGraphFrameTask([...scopeDependencies, layout.running]);
  const viewportRef = useRef<Viewport | null>(null);
  const wasVisibleRef = useRef(false);
  const pendingFitRef = useRef(false);
  const pendingActivationRef = useRef(false);
  const completedLayoutsRef = useRef(layout.completedLayouts);
  const current = useRef({ nodeCount, nodesReady, running: layout.running });
  useEffect(() => {
    current.current = { nodeCount, nodesReady, running: layout.running };
  }, [nodeCount, nodesReady, layout.running]);

  useEffect(() => {
    if (nodeCount === 0) {
      settled.current = false;
      mask();
    }
  }, [nodeCount, settled, mask]);

  const isContainerVisible = useCallback(() => {
    const element = containerRef.current;
    return !!element && element.clientWidth > 0 && element.clientHeight > 0;
  }, [containerRef]);
  const hasStoreDimensions = viewportWidth > 0 && viewportHeight > 0;
  const storeViewport = useCallback(
    (viewport?: Viewport) => {
      viewportRef.current = viewport ?? rf.getViewport();
    },
    [rf]
  );

  const fit = useCallback(
    (onDone?: () => void) => {
      viewportTask.schedule(async (isCurrent) => {
        if (
          !current.current.nodesReady ||
          current.current.nodeCount === 0 ||
          !isContainerVisible() ||
          (requireStoreDimensions && !hasStoreDimensions)
        ) {
          pendingFitRef.current = true;
          return;
        }
        try {
          const fitted = await rf.fitView({ padding: 0.2, duration: 0 });
          if (!isCurrent()) return;
          if (!fitted || !isContainerVisible()) {
            pendingFitRef.current = true;
            return;
          }
          // React Flow's fit, including its minimum zoom, defines the framing.
          storeViewport();
          pending.current.fit = false;
          pending.current.restore = false;
          pendingFitRef.current = false;
          onDone?.();
        } catch (error) {
          if (!isCurrent()) return;
          pendingFitRef.current = true;
          onError?.('fit', error);
        }
      });
    },
    [
      rf,
      viewportTask,
      isContainerVisible,
      requireStoreDimensions,
      hasStoreDimensions,
      storeViewport,
      pending,
      onError,
    ]
  );

  const restoreOrFit = useCallback(
    (onDone?: () => void) => {
      const viewport = viewportRef.current;
      if (pending.current.fit || !settled.current || !viewport) {
        fit(onDone);
        return;
      }
      viewportTask.schedule(async (isCurrent) => {
        if (!isContainerVisible()) {
          if (retryHiddenRestore) pendingFitRef.current = true;
          return;
        }
        try {
          await rf.setViewport(viewport, { duration: 0 });
          if (isCurrent() && isContainerVisible()) {
            pending.current.restore = false;
            onDone?.();
          }
        } catch (error) {
          if (!isCurrent()) return;
          pendingFitRef.current = true;
          onError?.('restore', error);
        }
      });
    },
    [
      rf,
      settled,
      pending,
      fit,
      viewportTask,
      isContainerVisible,
      retryHiddenRestore,
      onError,
    ]
  );

  const onMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => storeViewport(viewport),
    [storeViewport]
  );
  useEffect(() => {
    if (!viewportRef.current) storeViewport();
  }, [storeViewport]);

  useEffect(() => {
    if (layout.running || completedLayoutsRef.current === layout.completedLayouts)
      return;
    completedLayoutsRef.current = layout.completedLayouts;
    if (pending.current.fit && nodeCount > 0) {
      if (!hasStoreDimensions || (requireStoreDimensions && !isContainerVisible())) {
        pendingFitRef.current = true;
        pending.current.initialReveal = false;
      } else {
        fit(() => {
          if (pending.current.initialReveal) {
            pending.current.initialReveal = false;
            reveal();
          }
        });
      }
    }
    if (pendingActivationRef.current && current.current.nodeCount > 0) {
      pendingActivationRef.current = false;
      restoreOrFit(reveal);
    }
    if (pending.current.restore && current.current.nodeCount > 0) {
      restoreOrFit(reveal);
    }
  }, [
    layout.running,
    layout.completedLayouts,
    pending,
    nodeCount,
    hasStoreDimensions,
    requireStoreDimensions,
    isContainerVisible,
    fit,
    restoreOrFit,
    reveal,
  ]);

  // A background layout or invalidated measurement keeps its fit request alive.
  useEffect(() => {
    if (
      !pendingFitRef.current ||
      !active ||
      !nodesReady ||
      nodeCount === 0 ||
      layout.running ||
      !isContainerVisible() ||
      !hasStoreDimensions
    )
      return;
    fit(reveal);
  }, [
    active,
    nodesReady,
    nodeCount,
    layout.running,
    viewportWidth,
    viewportHeight,
    isContainerVisible,
    hasStoreDimensions,
    fit,
    reveal,
  ]);

  useLayoutEffect(() => {
    const visible =
      active &&
      isContainerVisible() &&
      (!requireStoreDimensions || hasStoreDimensions);
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (!visible || wasVisible) return;
    mask();
    if (current.current.running) {
      pendingActivationRef.current = true;
      return;
    }
    restoreOrFit(reveal);
  }, [
    active,
    viewportWidth,
    viewportHeight,
    isContainerVisible,
    requireStoreDimensions,
    hasStoreDimensions,
    mask,
    restoreOrFit,
    reveal,
  ]);

  const afterPortalSwitch = useCallback(() => {
    if (!current.current.nodesReady || current.current.nodeCount === 0) return;
    mask();
    if (current.current.running) {
      pendingActivationRef.current = true;
      return;
    }
    pendingActivationRef.current = false;
    restoreOrFit(() => {
      pending.current.initialReveal = false;
      reveal();
    });
  }, [mask, restoreOrFit, pending, reveal]);

  useEffect(() => {
    const beforeSwitch: EventListener = (event) => {
      const detail = (event as CustomEvent<PortalBridgeSwitchDetail>).detail;
      if (detail?.id !== portalId) return;
      viewportTask.cancel();
      mask();
    };
    const afterSwitch: EventListener = (event) => {
      const detail = (event as CustomEvent<PortalBridgeSwitchDetail>).detail;
      if (detail?.id !== portalId) return;
      setAutoResizeLayoutEnabled(detail.location !== 'target');
      afterPortalSwitch();
    };
    window.addEventListener(PORTAL_BRIDGE_BEFORE_SWITCH_EVENT, beforeSwitch);
    window.addEventListener(PORTAL_BRIDGE_SWITCH_EVENT, afterSwitch);
    return () => {
      window.removeEventListener(PORTAL_BRIDGE_BEFORE_SWITCH_EVENT, beforeSwitch);
      window.removeEventListener(PORTAL_BRIDGE_SWITCH_EVENT, afterSwitch);
    };
  }, [portalId, viewportTask, mask, setAutoResizeLayoutEnabled, afterPortalSwitch]);

  return useMemo(() => ({ fit, onMoveEnd }), [fit, onMoveEnd]);
}
