import { hashConfig, type Configuration, type Transition } from '@mytypes/TMTypes';
import { nextConfigurations } from '@tmfunctions/Configurations';

export type ConfigGraph = {
  startconfig: Configuration;
  startconfighash: string;
  Graph: Map<
    string,
    {
      config: Configuration;
      computed: boolean;
      next: [string, number][];
    }
  >;
};

/** Expand breadth first, preserving insertion order and transition indices. */
export function expandConfigGraph(
  graph: ConfigGraph['Graph'],
  startConfig: Configuration,
  targetNodes: number,
  transitions: Map<string, Transition[]>,
  numberOfTapes: number,
  blank: string
): boolean {
  const startHash = hashConfig(startConfig);
  if (graph.get(startHash)?.computed) return false;
  if (!graph.has(startHash)) {
    graph.set(startHash, { config: startConfig, computed: false, next: [] });
  }

  // An index avoids repeatedly shifting a potentially large BFS queue.
  const queue = [startConfig];
  for (let index = 0; index < queue.length && graph.size < targetNodes; index++) {
    const current = queue[index];
    const entry = graph.get(hashConfig(current))!;
    if (entry.computed) continue;

    for (const [nextConfig, transitionIndex] of nextConfigurations(
      current,
      transitions.get(current.state),
      numberOfTapes,
      blank
    )) {
      const nextHash = hashConfig(nextConfig);
      if (!graph.has(nextHash)) {
        graph.set(nextHash, { config: nextConfig, computed: false, next: [] });
        queue.push(nextConfig);
      }
      if (!entry.next.some(([hash]) => hash === nextHash)) {
        entry.next.push([nextHash, transitionIndex]);
      }
    }
    entry.computed = true;
  }
  return true;
}

export function computeConfigGraph(
  config: Configuration,
  minNumberNodes: number,
  transitions: Map<string, Transition[]>,
  numberOfTapes: number,
  blank: string
): ConfigGraph {
  const graph: ConfigGraph = {
    startconfig: config,
    startconfighash: hashConfig(config),
    Graph: new Map(),
  };
  expandConfigGraph(
    graph.Graph,
    config,
    minNumberNodes,
    transitions,
    numberOfTapes,
    blank
  );
  return graph;
}
