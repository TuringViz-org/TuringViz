// src/components/ConfigGraph/util/buildConfigGraph.ts
import { Node, Edge } from '@xyflow/react';
import { hashConfig } from '@mytypes/TMTypes';
import type { Configuration, Transition } from '@mytypes/TMTypes';
import type { ConfigGraph } from '@tmfunctions/ConfigGraph';
import { CARDS_LIMIT } from './constants';
import { ConfigNodeMode } from '@utils/constants';
import {
  buildTopologyKey,
  createConfigFlowNode,
  createTransitionFlowEdge,
} from '@components/shared/buildConfigGraphElements';

/**
 * Builds a React Flow graph representing the Config Graph from the zustand store
 * - Node-Type: "config" (circle) or "configCard" (full card)
 * - Edge-Type: "floating" or "loop"
 */
export function buildConfigGraph(
  cfgGraph: ConfigGraph,
  transitionsByState: Map<string, Transition[]>,
  currentConfig?: Configuration | null,
  mode: ConfigNodeMode = ConfigNodeMode.NODES
): { nodes: Node[]; edges: Edge[]; topoKey: string } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const currentHash = currentConfig ? hashConfig(currentConfig) : null;
  const isCardMode = mode === ConfigNodeMode.CARDS;
  const maxNodes = isCardMode ? CARDS_LIMIT : Number.POSITIVE_INFINITY;
  const includedNodeIds = new Set<string>();

  // --- Nodes ---
  cfgGraph.Graph.forEach((val, hash) => {
    if (includedNodeIds.size >= maxNodes) return;
    const config = val.config;
    includedNodeIds.add(hash);

    nodes.push(createConfigFlowNode({
      id: hash,
      config,
      nodeMode: mode,
      label: config.state,
      isStart: hash === cfgGraph.startconfighash,
      isCurrent: currentHash === hash,
      isComputed: val.computed,
    }));
  });

  // --- Edges ---
  // (include transition data for tooltips/inspection)
  cfgGraph.Graph.forEach((val, fromHash) => {
    const fromCfg = val.config;
    const transitionList = transitionsByState.get(fromCfg.state) ?? [];

    for (const [toHash, tIdx] of val.next) {
      if (!includedNodeIds.has(fromHash) || !includedNodeIds.has(toHash)) continue;
      const transition = transitionList[tIdx];
      const isLoop = fromHash === toHash;
      const edgeId = `${fromHash}→${toHash}#${tIdx}`;

      edges.push(createTransitionFlowEdge({
        id: edgeId,
        source: fromHash,
        target: toHash,
        isLoop,
        label: transition ? `${fromCfg.state} #${tIdx + 1}` : '',
        transition,
      }));
    }
  });

  const nodeIds = nodes.map((n) => n.id).sort();
  const edgeKeys = Array.from(
    new Set(
      edges.filter((e) => e.source !== e.target).map((e) => `${e.source}→${e.target}`)
    )
  ).sort();
  const topoKey = buildTopologyKey(nodeIds, edgeKeys);

  return { nodes, edges, topoKey };
}
