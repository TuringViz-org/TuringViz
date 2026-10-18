import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

type LayoutApi = { restart: () => void };

/** Coalesce layout requests while retaining their intent across StrictMode replay. */
export function useDebouncedLayoutRestart(layout: LayoutApi) {
  const layoutRef = useRef(layout);
  const pendingRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const enqueue = useCallback(() => {
    if (frameRef.current !== null || timeoutRef.current !== null) return;
    const run = () => {
      frameRef.current = null;
      timeoutRef.current = null;
      pendingRef.current = false;
      layoutRef.current.restart();
    };
    if (typeof requestAnimationFrame === 'function') {
      frameRef.current = requestAnimationFrame(run);
    } else {
      timeoutRef.current = setTimeout(run, 0);
    }
  }, []);

  useEffect(() => {
    // StrictMode tears effects down after layout effects have requested work.
    // Requeue that work on setup, instead of silently losing the first layout.
    if (pendingRef.current) enqueue();
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      frameRef.current = null;
      timeoutRef.current = null;
    };
  }, [enqueue]);

  return useCallback(() => {
    pendingRef.current = true;
    enqueue();
  }, [enqueue]);
}
