import type { ElkNode } from '@openedges/elk-layout';

const legacyAlgorithms = new Set(['force', 'mrtree', 'stress', 'radial']);

export function isLegacyElkGraph(graph: ElkNode): boolean {
  const options = graph.layoutOptions;
  const algorithm =
    options?.['elk.algorithm'] ??
    options?.['org.eclipse.elk.algorithm'] ??
    'layered';
  return legacyAlgorithms.has(algorithm.replace(/^org\.eclipse\.elk\./, ''));
}
