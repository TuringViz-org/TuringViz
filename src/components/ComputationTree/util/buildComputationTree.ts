// src/components/ComputationTree/util/buildComputationTree.ts
import {
  EdgeType,
  NodeType,
  CONFIG_NODE_DIAMETER,
  CONFIG_CARD_WIDTH,
} from '../util/constants';
import {
  ComputationTreeNode,
  ComputationTree,
  End,
} from '@tmfunctions/ComputationTree';
import { ConfigNodeMode } from '@utils/constants';
import { Transition } from '@mytypes/TMTypes';
import type { CSSProperties } from 'react';
import type { ConfigNodeData } from '@components/ConfigGraph/nodes/ConfigNode';
import type { ConfigCardNodeData } from '@components/ConfigGraph/nodes/ConfigCardNode';
import type { FloatingEdgeData } from '@components/ConfigGraph/edges/FloatingEdge';

export type CTNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: ConfigNodeData | ConfigCardNodeData;
};

export type CTEdge = {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  data: FloatingEdgeData;
  style?: CSSProperties;
  label?: string;
};

export type BuildResult = {
  nodes: CTNode[];
  edges: CTEdge[];
  topoKey: string;
  perf?: {
    buildMs: number;
    nodes: number;
    edges: number;
  };
};

/**
 * Builds a react flow graph representing the computation tree
 * - Node-Type: "config" (circle) or "configCard" (card) depending on nodeMode
 * - Edge-Type: "floating"
 */
export function buildComputationTreeGraph(
  model: ComputationTree,
  transitionsByState: Map<string, Transition[]>,
  nodeMode: ConfigNodeMode
): BuildResult {
  const t0 = performance.now();

  const useCards = nodeMode === ConfigNodeMode.CARDS;

  // Index
  const byId = new Map<number, ComputationTreeNode>();
  for (const n of model.nodes) byId.set(n.id, n);
  byId.set(model.root.id, model.root);

  // Edges
  const rfEdges: CTEdge[] = model.edges.map((e) => {
    const fromNode = byId.get(e.from);
    const toNode = byId.get(e.to);
    const sourceState = fromNode?.config?.state ?? null;
    const tList = sourceState ? (transitionsByState.get(sourceState) ?? []) : [];
    const t =
      e.transitionIndex != null &&
      e.transitionIndex >= 0 &&
      e.transitionIndex < tList.length
        ? tList[e.transitionIndex]
        : undefined;

    const isCompressed = e.compressed === true;
    const compLen = Math.max(1, e.compressedLength ?? (isCompressed ? 2 : 1));

    // TODO: Remove obsolete label
    const label = isCompressed
      ? `Compressed path\nLength: ${compLen} transitions\n${sourceState ?? ''} → ${toNode?.config?.state ?? ''}`
      : '';

    return {
      id: `${e.from}→${e.to}#${e.transitionIndex ?? ''}`,
      source: String(e.from),
      target: String(e.to),
      type: EdgeType.FLOATING,
      data: {
        highlighted: false,
        transition: t,
        compressed: isCompressed,
        compressedLength: compLen,
      },
      style: isCompressed
        ? { strokeWidth: 2, strokeDasharray: '6 4' }
        : { strokeWidth: 1.5 },
      label: isCompressed ? label : undefined,
    };
  });

  // Nodes (ohne Position)
  const rfNodes: CTNode[] = [...byId.values()].map((n) => {
    const label =
      n.config?.state && n.config.state.trim().length ? n.config.state : `q${n.id}`;
    const isStart = n.id === model.root.id;
    const isComputed = n.end !== End.NotYetComputed;

    return {
      id: String(n.id),
      type: useCards ? NodeType.CONFIG_CARD : NodeType.CONFIG,
      position: { x: 0, y: 0 }, // Position is set later by layout
      width: useCards ? CONFIG_CARD_WIDTH : CONFIG_NODE_DIAMETER,
      height: useCards ? undefined : CONFIG_NODE_DIAMETER,
      origin: [0.5, 0.5],
      data: {
        label,
        config: n.config,
        isStart,
        isCurrent: false,
        isComputed,
        pendingInteractive: false,
      },
    };
  });

  // Topology-Key
  const nodeIds = [...byId.keys()].sort((a, b) => a - b).map(String);
  const edgeKeys = model.edges
    .map((e) => `${e.from}→${e.to}#${e.transitionIndex ?? ''}`)
    .sort();
  const topoKey = `${nodeIds.join('|')}__${edgeKeys.join('|')}`;

  const t1 = performance.now();
  const perf = {
    buildMs: +(t1 - t0).toFixed(1),
    nodes: rfNodes.length,
    edges: rfEdges.length,
  };

  return { nodes: rfNodes, edges: rfEdges, topoKey, perf };
}
