// src/components/ConfigGraph/ConfigVisualization/useSyncedHorizontalScroll.ts
import { useRef, useState, useEffect, useCallback, type MouseEventHandler } from 'react';

const INTERACTIVE_ATTR = 'ctInteractive';

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
 * Manages synchronized horizontal scrolling across multiple tape rows.
 */
export function useSyncedHorizontalScroll(options?: { thumbMinWidth?: number }) {
  const { thumbMinWidth = 24 } = options ?? {};

  // Viewports (one per tape)
  const tapeViewportRefs = useRef<Array<HTMLDivElement | null>>([]);
  const viewportRefCallbacksRef = useRef(
    new Map<number, (nextViewport: HTMLDivElement | null) => void>()
  );
  const viewportCleanupRef = useRef(new Map<HTMLDivElement, () => void>());
  const [viewportVersion, setViewportVersion] = useState(0);

  const setViewportRef = useCallback(
    (index: number) => {
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
    },
    []
  );

  // Custom scrollbar pieces
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  // Visual state
  const [hasOverflow, setHasOverflow] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [thumb, setThumb] = useState({ width: 0, left: 0 });
  const [dragging, setDragging] = useState(false);

  // Internal guards & drag state
  const isSyncingRef = useRef(false);
  const draggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; left: number }>({ x: 0, left: 0 });
  const thumbRafRef = useRef<number | null>(null);

  // Keep latest thumb state in a ref so drag handlers never capture stale values.
  const thumbStateRef = useRef(thumb);
  useEffect(() => {
    thumbStateRef.current = thumb;
  }, [thumb]);

  // Helper: first available viewport is the "master"
  const getMaster = useCallback(
    () => tapeViewportRefs.current.find((el) => Boolean(el)) ?? null,
    []
  );

  // Recompute thumb (size/position) from master viewport
  const updateThumb = useCallback(() => {
    const viewport = getMaster();
    const track = trackRef.current;
    if (!viewport || !track) return;

    const trackWidth = Math.max(0, track.clientWidth);
    const scrollWidth = viewport.scrollWidth;
    const clientWidth = viewport.clientWidth;

    const overflow = scrollWidth > clientWidth + 1;
    setHasOverflow((prev) => (prev === overflow ? prev : overflow));

    if (!overflow) {
      setThumb((prev) => (prev.width === 0 && prev.left === 0 ? prev : { width: 0, left: 0 }));
      return;
    }

    const ratio = clientWidth / scrollWidth;
    const width = Math.max(thumbMinWidth, Math.round(trackWidth * ratio));
    const maxLeft = Math.max(0, trackWidth - width);
    const left = Math.round(
      maxLeft * (viewport.scrollLeft / Math.max(1, scrollWidth - clientWidth))
    );

    setThumb((prev) => (prev.width === width && prev.left === left ? prev : { width, left }));
  }, [getMaster, thumbMinWidth]);

  // Coalesce thumb updates during scroll/drag into one frame.
  const scheduleThumbUpdate = useCallback(() => {
    if (thumbRafRef.current !== null) return;

    thumbRafRef.current = requestAnimationFrame(() => {
      thumbRafRef.current = null;
      updateThumb();
    });
  }, [updateThumb]);

  // Sync all viewports to a given scrollLeft
  const syncAllScrollLeft = useCallback((left: number) => {
    isSyncingRef.current = true;
    for (const viewport of tapeViewportRefs.current) {
      if (viewport) {
        viewport.scrollLeft = left;
      }
    }
    isSyncingRef.current = false;
  }, []);

  // Scroll handler for each viewport; pass source to avoid ping-pong
  const onViewportScroll = useCallback(
    (sourceViewport: HTMLDivElement | null) => {
      if (!sourceViewport || isSyncingRef.current) return;

      const left = sourceViewport.scrollLeft;
      isSyncingRef.current = true;

      for (const viewport of tapeViewportRefs.current) {
        if (viewport && viewport !== sourceViewport) {
          viewport.scrollLeft = left;
        }
      }

      isSyncingRef.current = false;
      scheduleThumbUpdate();
    },
    [scheduleThumbUpdate]
  );

  // Clicking the track jumps proportionally.
  const handleTrackMouseDown = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      event.stopPropagation();
      if (event.target === thumbRef.current) return;

      const master = getMaster();
      const track = trackRef.current;
      if (!master || !track) return;

      const rect = track.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const width = thumb.width;
      const maxLeft = Math.max(0, track.clientWidth - width);
      const newLeft = Math.min(maxLeft, Math.max(0, clickX - width / 2));

      const scrollMax = Math.max(1, master.scrollWidth - master.clientWidth);
      const scrollLeft = (newLeft / Math.max(1, maxLeft)) * scrollMax;

      syncAllScrollLeft(scrollLeft);
      scheduleThumbUpdate();
    },
    [getMaster, scheduleThumbUpdate, syncAllScrollLeft, thumb.width]
  );

  // Drag the thumb to scroll
  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;

      const master = getMaster();
      const track = trackRef.current;
      if (!master || !track) return;

      const dx = event.clientX - dragStartRef.current.x;
      const trackWidth = track.clientWidth;
      const width = thumbStateRef.current.width;
      const maxLeft = Math.max(0, trackWidth - width);
      const newLeft = Math.min(maxLeft, Math.max(0, dragStartRef.current.left + dx));

      const scrollMax = Math.max(1, master.scrollWidth - master.clientWidth);
      const scrollLeft = (newLeft / Math.max(1, maxLeft)) * scrollMax;
      syncAllScrollLeft(scrollLeft);
      scheduleThumbUpdate();
    };

    const onUp = () => {
      if (!draggingRef.current) return;

      draggingRef.current = false;
      setDragging(false);
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    const onDown = (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();

      draggingRef.current = true;
      setDragging(true);
      dragStartRef.current = { x: event.clientX, left: thumbStateRef.current.left };
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    const thumbElement = thumbRef.current;
    if (thumbElement) {
      thumbElement.addEventListener('mousedown', onDown);
    }

    return () => {
      if (thumbElement) {
        thumbElement.removeEventListener('mousedown', onDown);
      }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [getMaster, scheduleThumbUpdate, syncAllScrollLeft]);

  // Observe viewport/track size changes to keep thumb geometry in sync.
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      scheduleThumbUpdate();
    });

    for (const viewport of tapeViewportRefs.current) {
      if (viewport) {
        observer.observe(viewport);
      }
    }

    if (trackRef.current) {
      observer.observe(trackRef.current);
    }

    scheduleThumbUpdate();

    return () => {
      observer.disconnect();
    };
  }, [scheduleThumbUpdate, viewportVersion]);

  useEffect(() => {
    return () => {
      if (thumbRafRef.current !== null) {
        cancelAnimationFrame(thumbRafRef.current);
      }

      for (const cleanup of viewportCleanupRef.current.values()) {
        cleanup();
      }
      viewportCleanupRef.current.clear();
      viewportRefCallbacksRef.current.clear();
    };
  }, []);

  // Public helper: center all viewports to a specific scrollLeft.
  const centerAllTo = useCallback(
    (left: number) => {
      syncAllScrollLeft(left);
      scheduleThumbUpdate();
    },
    [scheduleThumbUpdate, syncAllScrollLeft]
  );

  return {
    // Refs
    tapeViewportRefs,
    setViewportRef,
    trackRef,
    thumbRef,

    // Visual state
    hasOverflow,
    hovered,
    setHovered,
    thumb,
    dragging,

    // Handlers
    onViewportScroll,
    handleTrackMouseDown,

    // Helpers
    getMaster,
    updateThumb,
    syncAllScrollLeft,
    centerAllTo,
  };
}
