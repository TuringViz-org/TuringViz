// src/components/ComputationTree/util/buildComputationTree.ts
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

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
import {
  GRAPH_EDGE_BASE_WIDTH,
  GRAPH_EDGE_COMPRESSED_WIDTH,
  GRAPH_EDGE_MARKER_SIZE,
} from '@components/shared/edgeVisualConstants';

export type BuildResult = {
  nodes: RFNode[];
  edges: RFEdge[];
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
  const rfEdges: RFEdge[] = model.edges.map((e) => {
    const fromNode = byId.get(e.from);
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
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: GRAPH_EDGE_MARKER_SIZE,
        height: GRAPH_EDGE_MARKER_SIZE,
      },
      style: isCompressed
        ? { strokeWidth: GRAPH_EDGE_COMPRESSED_WIDTH, strokeDasharray: '6 4' }
        : { strokeWidth: GRAPH_EDGE_BASE_WIDTH },
    };
  });

  // Nodes (ohne Position)
  const rfNodes: RFNode[] = [...byId.values()].map((n) => {
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
