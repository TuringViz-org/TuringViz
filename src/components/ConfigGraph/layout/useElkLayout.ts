import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

import {
  useGraphElkLayout,
  type LayoutAPI,
  type Options,
} from '@components/shared/layout/useGraphElkLayout';
import {
  CONFIG_CARD_HEIGHT_ESTIMATE,
  CONFIG_CARD_WIDTH,
  CONFIG_NODE_DIAMETER,
  NodeType,
} from '../util/constants';

export type { LayoutAPI, Options };

function getConfigNodeLayoutSize(node: RFNode): { width: number; height: number } {
  const isCardNode = node.type === NodeType.CONFIG_CARD;
  const width =
    node.measured?.width ??
    node.width ??
    (isCardNode ? CONFIG_CARD_WIDTH : CONFIG_NODE_DIAMETER);
  const height =
    node.measured?.height ??
    node.height ??
    (isCardNode ? CONFIG_CARD_HEIGHT_ESTIMATE : CONFIG_NODE_DIAMETER);
  return { width, height };
}

export function useElkLayout(
  options: Options & {
    nodes: RFNode[];
    edges: RFEdge[];
    onLayout: (positions: Map<string, { x: number; y: number }>) => void;
  }
): LayoutAPI {
  return useGraphElkLayout({
    ...options,
    getNodeLayoutSize: getConfigNodeLayoutSize,
    workerName: 'config-graph-elk-layout-worker',
  });
}
