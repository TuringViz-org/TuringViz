import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type DependencyList,
} from 'react';

/**
 * One viewport operation at a time. A newer operation, graph revision or unmount
 * invalidates both queued frames and continuations of an already awaited fit.
 * Callers must check isCurrent() after awaiting renderer APIs before revealing.
 */
export function useGraphFrameTask(scopeDependencies: DependencyList = []) {
  const frameRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancel();
    };
  }, [cancel]);

  // The caller supplies a fixed-length dependency list for its graph revision.
  useLayoutEffect(() => {
    cancel();
    return cancel;
  }, scopeDependencies);

  const schedule = useCallback(
    (task: (isCurrent: () => boolean) => void, frames = 2) => {
      cancel();
      const generation = generationRef.current;
      const isCurrent = () =>
        mountedRef.current && generation === generationRef.current;
      let remaining = Math.max(1, frames);
      const advance = () => {
        frameRef.current = null;
        if (!isCurrent()) return;
        remaining -= 1;
        if (remaining > 0) frameRef.current = window.requestAnimationFrame(advance);
        else task(isCurrent);
      };
      if (mountedRef.current)
        frameRef.current = window.requestAnimationFrame(advance);
    },
    [cancel]
  );

  return useMemo(() => ({ schedule, cancel }), [schedule, cancel]);
}
