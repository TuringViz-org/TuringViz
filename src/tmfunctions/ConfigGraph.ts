import type { Configuration } from '@mytypes/TMTypes';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { expandConfigGraph } from './configGraphModel';

export { computeConfigGraph, type ConfigGraph } from './configGraphModel';
export { recomputeConfigGraphWithTargetNodes } from '@services/configGraphComputation';

/** Extend a frontier configuration in the currently displayed graph. */
export function computeDeeperGraphFromState(
  config: Configuration,
  minNumberNodes: number
) {
  const store = useGlobalZustand.getState();
  const graph = store.configGraph;
  if (!graph) {
    console.error('No config graph available. Please compute the graph first.');
    return;
  }
  if (
    expandConfigGraph(
      graph.Graph,
      config,
      graph.Graph.size + minNumberNodes,
      store.transitions,
      store.numberOfTapes,
      store.blank
    )
  ) {
    store.incrementConfigGraphVersion();
  }
}
