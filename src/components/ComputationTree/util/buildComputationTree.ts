// src/components/ComputationTree/util/buildComputationTree.ts
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import {
  ComputationTreeNode,
  ComputationTree,
  End,
} from '@tmfunctions/ComputationTree';
import { ConfigNodeMode } from '@utils/constants';
import { Transition } from '@mytypes/TMTypes';
import {
  buildTopologyKey,
  createConfigFlowNode,
  createTransitionFlowEdge,
} from '@components/shared/buildConfigGraphElements';

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

    return createTransitionFlowEdge({
      id: `${e.from}→${e.to}#${e.transitionIndex ?? ''}`,
      source: String(e.from),
      target: String(e.to),
      transition: t,
      compressed: isCompressed,
      compressedLength: compLen,
      data: {
        highlighted: false,
      },
    });
  });

  // Nodes (ohne Position)
  const rfNodes: RFNode[] = [...byId.values()].map((n) => {
    const label =
      n.config?.state && n.config.state.trim().length ? n.config.state : `q${n.id}`;
    const isStart = n.id === model.root.id;
    const isComputed = n.end !== End.NotYetComputed;

    return createConfigFlowNode({
      id: String(n.id),
      config: n.config,
      nodeMode,
      label,
      isStart,
      isComputed,
      pendingInteractive: false,
    });
  });

  // Topology-Key
  const nodeIds = [...byId.keys()].sort((a, b) => a - b).map(String);
  const edgeKeys = model.edges
    .map((e) => {
      // Include compression metadata so toggling compressed mode always
      // invalidates layout cache in cards mode.
      const compressedFlag = e.compressed === true ? '1' : '0';
      const compressedLen = Math.max(1, e.compressedLength ?? 1);
      return `${e.from}→${e.to}#${e.transitionIndex ?? ''}@${compressedFlag}:${compressedLen}`;
    })
    .sort();
  const topoKey = buildTopologyKey(nodeIds, edgeKeys);

  const t1 = performance.now();
  const perf = {
    buildMs: +(t1 - t0).toFixed(1),
    nodes: rfNodes.length,
    edges: rfEdges.length,
  };

  return { nodes: rfNodes, edges: rfEdges, topoKey, perf };
}
