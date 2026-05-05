import { MarkerType, type Edge as RFEdge, type Node as RFNode } from '@xyflow/react';

import type { Configuration, Transition } from '@mytypes/TMTypes';
import { ConfigNodeMode } from '@utils/constants';
import {
  CONFIG_CARD_WIDTH,
  CONFIG_NODE_DIAMETER,
  EdgeType,
  NodeType,
} from '@components/shared/configGraphConstants';
import {
  GRAPH_EDGE_BASE_WIDTH,
  GRAPH_EDGE_COMPRESSED_WIDTH,
  GRAPH_EDGE_MARKER_SIZE,
} from '@components/shared/edgeVisualConstants';

type ConfigNodeParams = {
  id: string;
  config: Configuration;
  nodeMode: ConfigNodeMode;
  label: string;
  isStart: boolean;
  isCurrent?: boolean;
  isComputed: boolean;
  pendingInteractive?: boolean;
};

type TransitionEdgeParams = {
  id: string;
  source: string;
  target: string;
  transition?: Transition;
  label?: string;
  isLoop?: boolean;
  compressed?: boolean;
  compressedLength?: number;
  data?: Record<string, unknown>;
};

export function createConfigFlowNode({
  id,
  config,
  nodeMode,
  label,
  isStart,
  isCurrent = false,
  isComputed,
  pendingInteractive,
}: ConfigNodeParams): RFNode {
  const isCard = nodeMode === ConfigNodeMode.CARDS;
  return {
    id,
    type: isCard ? NodeType.CONFIG_CARD : NodeType.CONFIG,
    position: { x: 0, y: 0 },
    width: isCard ? CONFIG_CARD_WIDTH : CONFIG_NODE_DIAMETER,
    height: isCard ? undefined : CONFIG_NODE_DIAMETER,
    origin: [0.5, 0.5],
    data: {
      label,
      config,
      isStart,
      isCurrent,
      isComputed,
      ...(pendingInteractive == null ? {} : { pendingInteractive }),
    },
  };
}

export function createTransitionFlowEdge({
  id,
  source,
  target,
  transition,
  label,
  isLoop = false,
  compressed = false,
  compressedLength,
  data,
}: TransitionEdgeParams): RFEdge {
  return {
    id,
    source,
    target,
    type: isLoop ? EdgeType.LOOP : EdgeType.FLOATING,
    ...(label == null ? {} : { label }),
    data: {
      ...data,
      transition,
      ...(compressedLength == null ? {} : { compressedLength }),
      ...(compressed ? { compressed: true } : {}),
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: GRAPH_EDGE_MARKER_SIZE,
      height: GRAPH_EDGE_MARKER_SIZE,
    },
    style: compressed
      ? { strokeWidth: GRAPH_EDGE_COMPRESSED_WIDTH, strokeDasharray: '6 4' }
      : { strokeWidth: GRAPH_EDGE_BASE_WIDTH },
  };
}

export function buildTopologyKey(nodeIds: string[], edgeKeys: string[]): string {
  return `${nodeIds.join('|')}__${edgeKeys.join('|')}`;
}
