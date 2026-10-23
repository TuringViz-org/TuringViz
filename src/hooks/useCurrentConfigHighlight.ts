import { useMemo } from 'react';
import type { Node } from '@xyflow/react';
import { hashConfig, type Configuration } from '@mytypes/TMTypes';

function hashNodeConfiguration(_node: Node, config: Configuration) {
  return hashConfig(config);
}

/** Configuration graph IDs already contain hashConfig(config); tree IDs do not. */
export function configurationHashFromNodeId(node: Node) {
  return node.id;
}

// Index configurations only when the graph changes. A run step changes the
// highlight, so edges, topology and all other node objects can be reused.
export function useCurrentConfigHighlight<T extends { nodes: Node[] }>(
  base: T,
  currentConfig: Configuration,
  getNodeHash: (node: Node, config: Configuration) => string = hashNodeConfiguration
): T {
  const indicesByHash = useMemo(() => {
    const indices = new Map<string, number[]>();
    base.nodes.forEach((node, index) => {
      const config = node.data.config as Configuration | undefined;
      if (!config) return;
      const hash = getNodeHash(node, config);
      const matches = indices.get(hash) ?? [];
      matches.push(index);
      indices.set(hash, matches);
    });
    return indices;
  }, [base.nodes, getNodeHash]);
  const currentHash = useMemo(() => hashConfig(currentConfig), [currentConfig]);

  return useMemo(() => {
    const matches = indicesByHash.get(currentHash);
    if (!matches) return base;
    const nodes = [...base.nodes];
    for (const index of matches) {
      const node = nodes[index];
      nodes[index] = { ...node, data: { ...node.data, isCurrent: true } };
    }
    return { ...base, nodes };
  }, [base, indicesByHash, currentHash]);
}
