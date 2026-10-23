import { useLayoutEffect, useRef } from 'react';

type RevisionPart = string | number | boolean | null | undefined;
type GraphRevision = string | readonly RevisionPart[];

function sameRevision(previous: GraphRevision | null, current: GraphRevision) {
  if (previous === current) return true;
  if (
    previous === null ||
    typeof previous === 'string' ||
    typeof current === 'string'
  ) {
    return false;
  }
  return (
    previous.length === current.length &&
    current.every((part, index) => part === previous[index])
  );
}

/** One layout request for each measured graph revision, independent of tab visibility. */
export function useGraphLayoutRequest(
  revision: GraphRevision,
  ready: boolean,
  prepare: () => void,
  restart: () => void
) {
  const requestedRef = useRef<GraphRevision | null>(null);
  // Compare the parts on every commit, including callers that mutate a tuple.
  // Serializing a topology here would copy every configuration ID on each render.
  useLayoutEffect(() => {
    if (!ready || sameRevision(requestedRef.current, revision)) return;
    requestedRef.current = typeof revision === 'string' ? revision : [...revision];
    prepare();
    restart();
  });
}
