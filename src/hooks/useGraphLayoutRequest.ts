import { useLayoutEffect, useRef } from 'react';

/** One layout request for each measured graph revision, independent of tab visibility. */
export function useGraphLayoutRequest(
  revision: string,
  ready: boolean,
  prepare: () => void,
  restart: () => void
) {
  const requestedRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!ready || requestedRef.current === revision) return;
    requestedRef.current = revision;
    prepare();
    restart();
  }, [revision, ready, prepare, restart]);
}
