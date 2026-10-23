import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { Core } from 'cytoscape';

/** Schedule this callback after the renderer has created and populated its core. */
export function useCytoscapeClassSync(
  cyRef: RefObject<Core | null>,
  id: string | null,
  className: string
) {
  const previousId = useRef<string | null>(null);
  const previousCore = useRef<Core | null>(null);
  return useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (
      previousCore.current === cy &&
      previousId.current === id &&
      (!id || cy.getElementById(id).hasClass(className))
    )
      return;
    cy.batch(() => {
      if (previousId.current)
        cy.getElementById(previousId.current).removeClass(className);
      if (id) cy.getElementById(id).addClass(className);
    });
    previousId.current = id;
    previousCore.current = cy;
  }, [cyRef, id, className]);
}

/** Apply an exclusive highlight without recreating the graph. */
export function useCytoscapeClass(
  cyRef: RefObject<Core | null>,
  id: string | null,
  className: string
) {
  const synchronize = useCytoscapeClassSync(cyRef, id, className);
  useEffect(synchronize, [synchronize]);
}
