// src/components/TMGraph/util/buildTMGraph.ts
import { Node, Edge, MarkerType } from '@xyflow/react';

import {
  Move,
  TapePattern,
  TapeWrite,
  Transition,
  isTapePatternRealFieldbyField,
  isTapeWriteRealFieldbyField,
} from '@mytypes/TMTypes';
import { EdgeType, NodeType, STATE_NODE_DIAMETER } from './constants';

/**
 * Builds a react flow graph representing the TM from the zustand store
 * - Node-Type: "state"
 * - Edge-Types: "floating" and "loop"
 */
export function buildTMGraph(
  states: Set<string>,
  transitions: Map<string, Transition[]>
): { nodes: Node[]; edges: Edge[]; topoKey: string } {
  // --- Nodes ---
  const stateIds = Array.from(states);
  const nodes: Node[] = stateIds.map((s) => ({
    id: s,
    type: NodeType.STATE,
    data: {
      label: s,
    },
    // Position is set later by layout
    position: { x: 0, y: 0 },
    origin: [0.5, 0.5], // Center the node
    width: STATE_NODE_DIAMETER,
    height: STATE_NODE_DIAMETER,
  }));

  // --- Edges ---
  // Helper type for accumulating edges by directed pairs
  type EdgeAccum = {
    from: string;
    to: string;
    labels: string[];
    transitions: Transition[];
  };

  // Map to accumulate edges by directed pairs
  // Key: "from→to", Value: { from, to, labels[] }
  const edgesByPair = new Map<string, EdgeAccum>();
  // Set of directed pairs to detect reverse directions
  const directedPairs = new Set<string>();

  const dirKey = (from: string, to: string) => `${from}→${to}`;
  const undirectedKey = (a: string, b: string) =>
    a < b ? `${a}|${b}` : `${b}|${a}`;

  // Collect all transitions into edges
  transitions.forEach((list) => {
    list.forEach((t: Transition) => {
      const from = t.from;
      const to = t.to ?? from;

      const key = dirKey(from, to);
      directedPairs.add(key);

      const acc = edgesByPair.get(key) ?? { from, to, labels: [], transitions: [] };
      acc.labels.push(fmtTransition(t));
      acc.transitions.push(t);
      edgesByPair.set(key, acc);
    });
  });

  // Detect undirected pairs (A→B and B→A)
  const bothDirections = new Set<string>(); // canonical "A|B"
  // Iterate over all directed pairs and check the reverse
  directedPairs.forEach((k) => {
    const [from, to] = k.split('→');
    const reverse = dirKey(to, from);
    if (directedPairs.has(reverse) && from !== to) {
      bothDirections.add(undirectedKey(from, to));
    }
  });

  // Build real edges from the grouped pairs^
  const edges: Edge[] = [];
  edgesByPair.forEach(({ from, to, labels, transitions }) => {
    const isLoop = from === to;
    const id = dirKey(from, to);
    const canonical = undirectedKey(from, to);

    // Bend info only set if there are both directions (no loop)
    const hasBoth = !isLoop && bothDirections.has(canonical);
    const bendDirection = hasBoth ? (from < to ? 'up' : 'down') : undefined;

    edges.push({
      id,
      label: labels.join(' | '), // Join multiple labels with " | "
      source: from,
      target: to,
      type: isLoop ? EdgeType.LOOP : EdgeType.FLOATING,
      data: {
        ...(hasBoth ? { bended: true, bendDirection } : {}),
        highlighted: false,
        transitions,
      },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { strokeWidth: 1.5 },
    });
  });

  const nodeKey = stateIds.slice().sort().join('|');
  const edgeKey = Array.from(edgesByPair.keys()).sort().join('|');
  const topoKey = `${nodeKey}__${edgeKey}`;

  return { nodes, edges, topoKey };
}

/* --- Label-Formatter --- */
// Example: "0, _ -> 1, L"
function fmtTransition(t: Transition): string {
  const cond = fmtPattern(t.tapecondition);
  const wr = fmtWrite(t.write);
  const dir = fmtDir(t.direction);
  return `${cond} -> ${wr}, ${dir}`;
}

const fmtPattern = (p: TapePattern) =>
  p
    .map(
      (f) =>
        isTapePatternRealFieldbyField(f) ? (f.value === ' ' ? '_' : f.value) : '_' // Wildcard/All-Feld
    )
    .join(', ');

const fmtWrite = (w: TapeWrite) =>
  w
    .map(
      (f) =>
        isTapeWriteRealFieldbyField(f) ? (f.value === ' ' ? '_' : f.value) : '·' // same
    )
    .join(', ');

const fmtDir = (d: Move[]) => d.join(', ');
