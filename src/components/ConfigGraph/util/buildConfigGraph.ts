// src/components/ConfigGraph/util/buildConfigGraph.ts
import { Node, Edge, MarkerType } from '@xyflow/react';
import { hashConfig } from '@mytypes/TMTypes';
import type { Configuration, Transition } from '@mytypes/TMTypes';
import type { ConfigGraph } from '@tmfunctions/ConfigGraph';
import {
  NodeType,
  EdgeType,
  CONFIG_NODE_DIAMETER,
  CONFIG_CARD_WIDTH,
} from './constants';
import { ConfigNodeMode } from '@utils/constants';
import {
  GRAPH_EDGE_BASE_WIDTH,
  GRAPH_EDGE_MARKER_SIZE,
} from '@components/shared/edgeVisualConstants';

/**
 * Builds a React Flow graph representing the Config Graph from the zustand store
 * - Node-Type: "config" (circle) or "configCard" (full card)
 * - Edge-Type: "floating" or "loop"
 */
export function buildConfigGraph(
  cfgGraph: ConfigGraph,
  transitionsByState: Map<string, Transition[]>,
  currentConfig?: Configuration | null,
  mode: ConfigNodeMode = ConfigNodeMode.CIRCLES
): { nodes: Node[]; edges: Edge[]; topoKey: string } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const currentHash = currentConfig ? hashConfig(currentConfig) : null;

  // --- Nodes ---
  cfgGraph.Graph.forEach((val, hash) => {
    const config = val.config;
    const isCard = mode === ConfigNodeMode.CARDS;

    nodes.push({
      id: hash,
      type: isCard ? NodeType.CONFIG_CARD : NodeType.CONFIG,
      data: {
        label: config.state,
        config,
        isStart: hash === cfgGraph.startconfighash,
        isCurrent: currentHash === hash,
        isComputed: val.computed,
      },
      position: { x: 0, y: 0 }, // Positions are set by layout
      origin: [0.5, 0.5],
      // Provide dimensions so ELK can do a good first pass
      width: isCard ? CONFIG_CARD_WIDTH : CONFIG_NODE_DIAMETER,
      height: isCard ? undefined : CONFIG_NODE_DIAMETER,
    });
  });

  // --- Edges ---
  // (include transition data for tooltips/inspection)
  cfgGraph.Graph.forEach((val, fromHash) => {
    const fromCfg = val.config;
    const transitionList = transitionsByState.get(fromCfg.state) ?? [];

    for (const [toHash, tIdx] of val.next) {
      const transition = transitionList[tIdx];
      const isLoop = fromHash === toHash;
      const edgeId = `${fromHash}→${toHash}#${tIdx}`;

      edges.push({
        id: edgeId,
        source: fromHash,
        target: toHash,
        type: isLoop ? EdgeType.LOOP : EdgeType.FLOATING,
        label: transition ? `${fromCfg.state} #${tIdx + 1}` : '',
        data: { transition },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: GRAPH_EDGE_MARKER_SIZE,
          height: GRAPH_EDGE_MARKER_SIZE,
        },
        style: { strokeWidth: GRAPH_EDGE_BASE_WIDTH },
      });
    }
  });

  const nodeIds = nodes.map((n) => n.id).sort();
  const edgePairs = Array.from(
    new Set(
      edges.filter((e) => e.source !== e.target).map((e) => `${e.source}→${e.target}`)
    )
  )
    .sort()
    .join('|');
  const topoKey = `${nodeIds.join('|')}__${edgePairs}`;

  return { nodes, edges, topoKey };
}
