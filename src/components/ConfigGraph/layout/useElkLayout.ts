import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

import {
  useGraphElkLayout,
  type LayoutAPI,
  type Options,
} from '@components/shared/layout/useGraphElkLayout';
import { getConfigNodeLayoutSize } from '@components/shared/layout/configNodeLayout';

export type { LayoutAPI, Options };

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
