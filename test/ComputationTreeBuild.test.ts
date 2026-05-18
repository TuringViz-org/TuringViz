import { describe, expect, it } from 'vitest';

import { buildComputationTreeGraph } from '@components/ComputationTree/util/buildComputationTree';
import { CARDS_LIMIT, NodeType } from '@components/ComputationTree/util/constants';
import { End, type ComputationTree } from '@tmfunctions/ComputationTree';
import { ConfigNodeMode } from '@utils/constants';
import type { Configuration } from '@mytypes/TMTypes';

function makeConfig(id: number): Configuration {
  return {
    state: `q${id}`,
    tapes: [[[], []]],
    heads: [0],
  };
}

function makeTree(nodeCount: number): ComputationTree {
  const nodes = Array.from({ length: nodeCount }, (_, id) => ({
    id,
    config: makeConfig(id),
    end: id === nodeCount - 1 ? End.Halt : End.None,
  }));
  const edges = nodes.slice(1).map((node) => ({
    from: node.id - 1,
    to: node.id,
    transitionIndex: 0,
    compressed: false,
    compressedLength: 1,
  }));

  return {
    root: nodes[0],
    nodes,
    edges,
  };
}

describe('buildComputationTreeGraph', () => {
  it('limits rendered card nodes and filters edges to the rendered subset', () => {
    const graph = buildComputationTreeGraph(
      makeTree(CARDS_LIMIT + 5),
      new Map(),
      ConfigNodeMode.CARDS
    );

    expect(graph.nodes).toHaveLength(CARDS_LIMIT);
    expect(graph.edges).toHaveLength(CARDS_LIMIT - 1);
    expect(graph.nodes.every((node) => node.type === NodeType.CONFIG_CARD)).toBe(true);
    expect(graph.edges.at(-1)?.target).toBe(String(CARDS_LIMIT - 1));
  });

  it('keeps all nodes in node mode', () => {
    const graph = buildComputationTreeGraph(
      makeTree(CARDS_LIMIT + 5),
      new Map(),
      ConfigNodeMode.NODES
    );

    expect(graph.nodes).toHaveLength(CARDS_LIMIT + 5);
    expect(graph.edges).toHaveLength(CARDS_LIMIT + 4);
  });
});
