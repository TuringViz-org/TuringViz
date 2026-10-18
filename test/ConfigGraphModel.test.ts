import { describe, expect, it } from 'vitest';
import {
  computeConfigGraph,
  expandConfigGraph,
} from '@tmfunctions/configGraphModel';
import {
  hashConfig,
  Move,
  type Configuration,
  type Transition,
} from '@mytypes/TMTypes';

const configuration = (state: string): Configuration => ({
  state,
  tapes: [[[], [{ value: '_' }]]],
  heads: [0],
});
const transition = (from: string, to: string): Transition => ({
  from,
  to,
  tapecondition: [{}],
  write: [{}],
  direction: [Move.S],
});
const transitions = new Map([
  ['q0', [transition('q0', 'q1'), transition('q0', 'q2'), transition('q0', 'q1')]],
  ['q1', [transition('q1', 'done')]],
  ['q2', [transition('q2', 'done')]],
  ['done', []],
]);

const readable = (graph: ReturnType<typeof computeConfigGraph>) =>
  Array.from(graph.Graph.values(), (entry) => ({
    state: entry.config.state,
    computed: entry.computed,
    next: entry.next.map(([hash, index]) => [
      graph.Graph.get(hash)!.config.state,
      index,
    ]),
  }));

describe('configuration graph model', () => {
  it('preserves BFS insertion order, converging edges, and first transition indices', () => {
    expect(
      readable(computeConfigGraph(configuration('q0'), 10, transitions, 1, '_'))
    ).toEqual([
      {
        state: 'q0',
        computed: true,
        next: [
          ['q1', 0],
          ['q2', 1],
        ],
      },
      { state: 'q1', computed: true, next: [['done', 0]] },
      { state: 'q2', computed: true, next: [['done', 0]] },
      { state: 'done', computed: true, next: [] },
    ]);
  });

  it('finishes a branching expansion at the budget and leaves its frontier uncomputed', () => {
    const graph = computeConfigGraph(configuration('q0'), 2, transitions, 1, '_');
    expect(readable(graph)).toEqual([
      {
        state: 'q0',
        computed: true,
        next: [
          ['q1', 0],
          ['q2', 1],
        ],
      },
      { state: 'q1', computed: false, next: [] },
      { state: 'q2', computed: false, next: [] },
    ]);
    expect(
      expandConfigGraph(graph.Graph, configuration('q1'), 10, transitions, 1, '_')
    ).toBe(true);
    expect(graph.Graph.get(hashConfig(configuration('q2')))?.computed).toBe(false);
    expect(
      expandConfigGraph(graph.Graph, configuration('q0'), 10, transitions, 1, '_')
    ).toBe(false);
  });
});
