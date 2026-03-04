// src/components/ConfigGraph/ConfigVisualization/useSyncedHorizontalScroll.ts
import { useRef, useState, useEffect, useCallback } from 'react';

const INTERACTIVE_ATTR = 'ctInteractive';

type Options = {
  getBaseScrollLeft?: (index: number, viewport: HTMLDivElement) => number;
  onPanChange?: (pan: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function stopPropagation(event: Event) {
  event.stopPropagation();
}

function addViewportGuards(viewport: HTMLDivElement): () => void {
  viewport.dataset[INTERACTIVE_ATTR] = 'true';
  viewport.classList.add('ct-scrollable');
  viewport.style.touchAction = 'pan-x';

  const onWheel = (event: Event) => stopPropagation(event);
  const onMouseDown = (event: Event) => stopPropagation(event);
  const onTouchStart = (event: Event) => stopPropagation(event);

  viewport.addEventListener('wheel', onWheel, { passive: true });
  viewport.addEventListener('mousedown', onMouseDown);
  viewport.addEventListener('touchstart', onTouchStart, { passive: true });

  return () => {
    viewport.removeEventListener('wheel', onWheel);
    viewport.removeEventListener('mousedown', onMouseDown);
    viewport.removeEventListener('touchstart', onTouchStart);
  };
}

/**
 * Synchronizes horizontal scrolling across tape rows by sharing one pan value
 * on top of per-row head-centered base offsets.
 */
export function useSyncedHorizontalScroll(options?: Options) {
  const { getBaseScrollLeft, onPanChange } = options ?? {};

  const resolveBaseScrollLeft = useCallback(
    (index: number, viewport: HTMLDivElement) => {
      if (!getBaseScrollLeft) return 0;
      const raw = getBaseScrollLeft(index, viewport);
      const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      if (!Number.isFinite(raw)) return 0;
      return clamp(raw, 0, maxLeft);
    },
    [getBaseScrollLeft]
  );

  const tapeViewportRefs = useRef<Array<HTMLDivElement | null>>([]);
  const viewportRefCallbacksRef = useRef(
    new Map<number, (nextViewport: HTMLDivElement | null) => void>()
  );
  const viewportCleanupRef = useRef(new Map<HTMLDivElement, () => void>());
  const [viewportVersion, setViewportVersion] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);

  const isSyncingRef = useRef(false);
  const panRef = useRef(0);
  const suppressedScrollLeftRef = useRef(new Map<HTMLDivElement, number>());

  const setPanValue = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) return;
      panRef.current = value;
      onPanChange?.(value);
    },
    [onPanChange]
  );

  const setViewportRef = useCallback((index: number) => {
    const existing = viewportRefCallbacksRef.current.get(index);
    if (existing) return existing;

    const callback = (nextViewport: HTMLDivElement | null) => {
      const prevViewport = tapeViewportRefs.current[index];
      if (prevViewport === nextViewport) return;

      if (prevViewport) {
        viewportCleanupRef.current.get(prevViewport)?.();
        viewportCleanupRef.current.delete(prevViewport);
      }

      tapeViewportRefs.current[index] = nextViewport;
      if (nextViewport && !viewportCleanupRef.current.has(nextViewport)) {
        viewportCleanupRef.current.set(nextViewport, addViewportGuards(nextViewport));
      }

      setViewportVersion((prev) => prev + 1);
    };

    viewportRefCallbacksRef.current.set(index, callback);
    return callback;
  }, []);

  const getMaster = useCallback(() => {
    for (let i = 0; i < tapeViewportRefs.current.length; i++) {
      const viewport = tapeViewportRefs.current[i];
      if (viewport) return viewport;
    }
    return null;
  }, []);

  const getMasterWithIndex = useCallback(() => {
    for (let i = 0; i < tapeViewportRefs.current.length; i++) {
      const viewport = tapeViewportRefs.current[i];
      if (viewport) return { index: i, viewport };
    }
    return null;
  }, []);

  const getViewportIndex = useCallback((source: HTMLDivElement) => {
    for (let i = 0; i < tapeViewportRefs.current.length; i++) {
      if (tapeViewportRefs.current[i] === source) return i;
    }
    return -1;
  }, []);

  const recomputeOverflow = useCallback(() => {
    let overflow = false;

    for (const viewport of tapeViewportRefs.current) {
      if (!viewport) continue;
      if (viewport.scrollWidth > viewport.clientWidth + 1) {
        overflow = true;
        break;
      }
    }

    setHasOverflow((prev) => (prev === overflow ? prev : overflow));
  }, []);

  const getPanLimits = useCallback(() => {
    let minPan = Number.NEGATIVE_INFINITY;
    let maxPan = Number.POSITIVE_INFINITY;
    let foundAny = false;

    for (let i = 0; i < tapeViewportRefs.current.length; i++) {
      const viewport = tapeViewportRefs.current[i];
      if (!viewport) continue;
      foundAny = true;

      const base = resolveBaseScrollLeft(i, viewport);
      const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      minPan = Math.max(minPan, -base);
      maxPan = Math.min(maxPan, maxLeft - base);
    }

    if (!foundAny || !Number.isFinite(minPan) || !Number.isFinite(maxPan)) {
      return { minPan: 0, maxPan: 0 };
    }

    if (minPan > maxPan) {
      const fallback = (minPan + maxPan) / 2;
      return { minPan: fallback, maxPan: fallback };
    }

    return { minPan, maxPan };
  }, [resolveBaseScrollLeft]);

  const syncAllByPan = useCallback(
    (rawPan: number, skipViewportIndex?: number) => {
      const { minPan, maxPan } = getPanLimits();
      const clampedPan = clamp(rawPan, minPan, maxPan);

      isSyncingRef.current = true;
      for (let i = 0; i < tapeViewportRefs.current.length; i++) {
        if (skipViewportIndex !== undefined && i === skipViewportIndex) continue;
        const viewport = tapeViewportRefs.current[i];
        if (!viewport) continue;

        const base = resolveBaseScrollLeft(i, viewport);
        const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
        const target = clamp(base + clampedPan, 0, maxLeft);
        if (Math.abs(viewport.scrollLeft - target) > 0.25) {
          suppressedScrollLeftRef.current.set(viewport, target);
          viewport.scrollLeft = target;
        }
      }
      isSyncingRef.current = false;
      setPanValue(clampedPan);
      return clampedPan;
    },
    [getPanLimits, resolveBaseScrollLeft, setPanValue]
  );

  const syncAllScrollLeft = useCallback(
    (left: number) => {
      const master = getMasterWithIndex();
      if (!master) return;
      const base = resolveBaseScrollLeft(master.index, master.viewport);
      syncAllByPan(left - base);
    },
    [getMasterWithIndex, resolveBaseScrollLeft, syncAllByPan]
  );

  const onViewportScroll = useCallback(
    (sourceViewport: HTMLDivElement | null) => {
      if (!sourceViewport || isSyncingRef.current) return;

      const sourceIndex = getViewportIndex(sourceViewport);
      if (sourceIndex < 0) return;

      const suppressedLeft = suppressedScrollLeftRef.current.get(sourceViewport);
      if (suppressedLeft !== undefined) {
        if (Math.abs(sourceViewport.scrollLeft - suppressedLeft) <= 0.5) {
          suppressedScrollLeftRef.current.delete(sourceViewport);
          return;
        }
        suppressedScrollLeftRef.current.delete(sourceViewport);
      }

      const base = resolveBaseScrollLeft(sourceIndex, sourceViewport);
      const rawPan = sourceViewport.scrollLeft - base;
      const clampedPan = syncAllByPan(rawPan, sourceIndex);

      // Correct the active viewport only if clamping was necessary.
      if (Math.abs(clampedPan - rawPan) > 0.25) {
        const maxLeft = Math.max(0, sourceViewport.scrollWidth - sourceViewport.clientWidth);
        const correctedLeft = clamp(base + clampedPan, 0, maxLeft);
        if (Math.abs(sourceViewport.scrollLeft - correctedLeft) > 0.25) {
          isSyncingRef.current = true;
          suppressedScrollLeftRef.current.set(sourceViewport, correctedLeft);
          sourceViewport.scrollLeft = correctedLeft;
          isSyncingRef.current = false;
        }
      }
    },
    [getViewportIndex, resolveBaseScrollLeft, syncAllByPan]
  );

  const centerAllTo = useCallback(
    (left: number) => {
      syncAllScrollLeft(left);
    },
    [syncAllScrollLeft]
  );

  const scrollByDelta = useCallback(
    (delta: number) => {
      if (!Number.isFinite(delta) || delta === 0) return;
      syncAllByPan(panRef.current + delta);
    },
    [syncAllByPan]
  );

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      syncAllByPan(panRef.current);
      recomputeOverflow();
    });

    for (const viewport of tapeViewportRefs.current) {
      if (viewport) observer.observe(viewport);
    }

    syncAllByPan(panRef.current);
    recomputeOverflow();

    return () => {
      observer.disconnect();
    };
  }, [recomputeOverflow, syncAllByPan, viewportVersion]);

  useEffect(() => {
    syncAllByPan(panRef.current);
    recomputeOverflow();
  }, [resolveBaseScrollLeft, syncAllByPan, recomputeOverflow]);

  useEffect(() => {
    return () => {
      for (const cleanup of viewportCleanupRef.current.values()) {
        cleanup();
      }
      suppressedScrollLeftRef.current.clear();
      viewportCleanupRef.current.clear();
      viewportRefCallbacksRef.current.clear();
    };
  }, []);

  return {
    setViewportRef,
    hasOverflow,
    onViewportScroll,
    getMaster,
    centerAllTo,
    scrollByDelta,
  };
}
