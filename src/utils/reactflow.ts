// src/utils/reactflow.ts
// Utility functions for React Flow graphs, including reconciliation of nodes and edges
import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';

// Check if two objects are shallowly equal
function shallowEqual(a: any, b: any) {
  if (a === b) return true;
  if (!a || !b) return false;

  const ka = Object.keys(a);
  const kb = Object.keys(b);

  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

// Reconcile previous and base nodes/edges to minimize re-renders in React Flow
// by reusing unchanged objects
export function reconcileNodes(
  prev: RFNode[], // previous nodes
  base: RFNode[], // new nodes to reconcile with
  makeData: (n: RFNode, old?: RFNode) => any // function add additional data to node
): RFNode[] {
  const prevById = new Map(prev.map((n) => [n.id, n]));
  let changed = false;

  const next = base.map((n) => {
    const old = prevById.get(n.id);
    const dataNext = makeData(n, old);

    if (old) {
      const sameType = old.type === n.type;
      const sameData = shallowEqual(old.data, dataNext);

      if (sameType && sameData) {
        return old;
      }
    }

    changed = true;
    return { ...n, data: dataNext, position: old?.position ?? n.position };
  });

  if (next.length !== prev.length) changed = true;

  return changed ? next : prev;
}

// Similar to reconcileNodes but for edges
export function reconcileEdges(prev: RFEdge[], base: RFEdge[]): RFEdge[] {
  const prevById = new Map(prev.map((e) => [e.id, e]));
  let changed = false;

  const next = base.map((e) => {
    const old = prevById.get(e.id);
    if (old && shallowEqual(old, e)) return old;
    changed = true;
    return e;
  });

  if (next.length !== prev.length) changed = true;

  return changed ? next : prev;
}
