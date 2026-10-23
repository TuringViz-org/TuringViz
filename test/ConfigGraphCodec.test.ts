// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  packConfigGraph,
  unpackConfigGraph,
  configGraphTransferables,
} from '../src/workers/configGraphCodec';
import { computeConfigGraph, type ConfigGraph } from '@tmfunctions/configGraphModel';
import { ExampleTMs, NonDetSAT } from '@utils/ExampleTMs';
import {
  ConfigNodeMode,
  DEFAULT_CONFIG_GRAPH_TARGET_NODES,
  DEFAULT_GRAPH_CARDS_ELK_OPTS,
  DEFAULT_GRAPH_NODES_ELK_OPTS,
} from '@utils/constants';
import { buildConfigGraph } from '@components/ConfigGraph/util/buildConfigGraph';
import { buildElkGraph } from '@components/shared/layout/graphLayout';
import { getConfigNodeLayoutSize } from '@components/shared/layout/configNodeLayout';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { loadTuringMachineFromSource } from '../src/tmLanguage/loadMachine';
import type { Configuration } from '@mytypes/TMTypes';

function graphFixture(): ConfigGraph {
  const startconfig: Configuration = {
    state: 'state🚀',
    tapes: [
      [[{ value: '' }, { value: '多字' }], [{ value: '\0' }]],
      [[], []],
    ],
    heads: [-2, 0],
  };
  const other: Configuration = {
    state: '',
    tapes: [[[{ value: '' }], [{ value: '多字' }, { value: '🚀' }]]],
    heads: [-1],
  };
  return {
    startconfig,
    startconfighash: 'z\u0001root',
    Graph: new Map([
      [
        'z\u0001root',
        {
          config: startconfig,
          computed: true,
          next: [
            ['a-child', 8],
            ['z\u0001root', 0],
            ['a-child', 4294967295],
          ],
        },
      ],
      ['a-child', { config: other, computed: false, next: [] }],
    ]),
  };
}

function roundTrip(graph: ConfigGraph) {
  const packed = packConfigGraph(graph);
  expect(packed).not.toBeNull();
  const transfer = configGraphTransferables(packed!);
  const transported = structuredClone(packed!, { transfer });
  expect(transfer.every((buffer) => buffer.byteLength === 0)).toBe(true);
  return unpackConfigGraph(transported);
}

describe('configuration graph worker codec', () => {
  it('preserves every value, insertion order, frontier and root alias through transferred buffers', () => {
    const original = graphFixture();
    const snapshot = structuredClone(original);
    const restored = roundTrip(original);
    expect(restored).toEqual(snapshot);
    expect([...restored.Graph.keys()]).toEqual([...original.Graph.keys()]);
    expect(restored.startconfig).toBe(
      restored.Graph.get(restored.startconfighash)!.config
    );
    expect(original).toEqual(snapshot);
    expect(restored.startconfig).not.toBe(original.startconfig);
    restored.startconfig.tapes[0][0][0].value = 'changed';
    restored.startconfig.heads[0] = 999;
    expect(original).toEqual(snapshot);
    expect(restored.Graph.get('a-child')!.config.tapes[0][0][0].value).toBe('');
  });

  it('keeps richer or unrepresentable data on the full-result path', () => {
    const cases: ConfigGraph[] = [];
    let graph = graphFixture();
    Object.assign(graph, { metadata: 'keep' });
    cases.push(graph);
    graph = graphFixture();
    Object.assign(graph.startconfig, { metadata: 'keep' });
    cases.push(graph);
    graph = graphFixture();
    Object.assign(graph.startconfig.tapes[0][0][0], { metadata: 'keep' });
    cases.push(graph);
    graph = graphFixture();
    Object.assign(graph.startconfig.tapes[0], { metadata: 'keep' });
    cases.push(graph);
    graph = graphFixture();
    Object.assign(graph.Graph.get('a-child')!, { metadata: 'keep' });
    cases.push(graph);
    graph = graphFixture();
    graph.startconfig = structuredClone(graph.startconfig);
    cases.push(graph);
    graph = graphFixture();
    graph.Graph.get('a-child')!.next.push(['missing', 1]);
    cases.push(graph);
    graph = graphFixture();
    graph.Graph.get('a-child')!.next.push([graph.startconfighash, -1]);
    cases.push(graph);
    graph = graphFixture();
    graph.Graph.get('a-child')!.next.push([graph.startconfighash, 4294967296]);
    cases.push(graph);
    graph = graphFixture();
    delete graph.startconfig.tapes[0][0][0];
    cases.push(graph);
    graph = graphFixture();
    graph.startconfig.tapes[0][0][1] = graph.startconfig.tapes[0][0][0];
    cases.push(graph);
    graph = graphFixture();
    graph.Graph.get('a-child')!.config.heads = graph.startconfig.heads;
    cases.push(graph);
    graph = graphFixture();
    Object.assign(graph.startconfig.heads, { metadata: 'keep' });
    cases.push(graph);
    for (const input of cases) {
      const snapshot = structuredClone(input);
      expect(packConfigGraph(input)).toBeNull();
      expect(input).toEqual(snapshot);
    }
  });

  it.each(['start', 'symbols', 'lengths', 'targets', 'nodes', 'hashes'] as const)(
    'rejects malformed %s before constructing a partial model',
    (field) => {
      const packed = packConfigGraph(graphFixture())!;
      if (field === 'start') packed.start = packed.nodes.length;
      if (field === 'symbols') packed.cells[0] = packed.symbols.length;
      if (field === 'lengths') packed.lengths[0] += 1;
      if (field === 'targets') packed.targets[0] = packed.nodes.length;
      if (field === 'nodes') packed.nodes[0][4] += 1;
      if (field === 'hashes') packed.hashes[1] = packed.hashes[0];
      expect(() => unpackConfigGraph(packed)).toThrow(
        'Invalid packed configuration graph'
      );
    }
  );

  it.each(ExampleTMs)(
    'preserves configuration and layout inputs for bundled $name in both node modes',
    (example) => {
      const diagnostics = loadTuringMachineFromSource(example.code);
      expect(
        diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
      ).toEqual([]);
      const machine = useGlobalZustand.getState();
      // Bound open-ended machines while retaining branches, merges and frontier
      // flags. Full NonDetSAT coverage remains in the separate regression below.
      const graph = computeConfigGraph(
        {
          state: machine.startState,
          tapes: machine.input,
          heads: Array(machine.numberOfTapes).fill(0),
        },
        512,
        machine.transitions,
        machine.numberOfTapes,
        machine.blank
      );
      const restored = roundTrip(graph);
      expect(restored).toEqual(graph);
      expect([...restored.Graph.keys()]).toEqual([...graph.Graph.keys()]);
      for (const mode of [ConfigNodeMode.NODES, ConfigNodeMode.CARDS]) {
        const originalFlow = buildConfigGraph(
          graph,
          machine.transitions,
          null,
          mode
        );
        const restoredFlow = buildConfigGraph(
          restored,
          machine.transitions,
          null,
          mode
        );
        const defaults =
          mode === ConfigNodeMode.NODES
            ? DEFAULT_GRAPH_NODES_ELK_OPTS
            : DEFAULT_GRAPH_CARDS_ELK_OPTS;
        const options = {
          ...defaults,
          algorithm: defaults.algorithm ?? 'layered',
          direction: defaults.direction ?? 'RIGHT',
        };
        expect(
          buildElkGraph(
            restoredFlow.nodes,
            restoredFlow.edges,
            getConfigNodeLayoutSize,
            options
          )
        ).toEqual(
          buildElkGraph(
            originalFlow.nodes,
            originalFlow.edges,
            getConfigNodeLayoutSize,
            options
          )
        );
      }
    },
    15000
  );

  it('round-trips the complete default NonDetSAT graph without changing configurations or edges', () => {
    const diagnostics = loadTuringMachineFromSource(NonDetSAT.code);
    expect(
      diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
    ).toEqual([]);
    const machine = useGlobalZustand.getState();
    const graph = computeConfigGraph(
      {
        state: machine.startState,
        tapes: machine.input,
        heads: Array(machine.numberOfTapes).fill(0),
      },
      DEFAULT_CONFIG_GRAPH_TARGET_NODES,
      machine.transitions,
      machine.numberOfTapes,
      machine.blank
    );
    expect(graph.Graph.size).toBe(14199);
    expect(
      [...graph.Graph.values()].reduce(
        (count, entry) => count + entry.next.length,
        0
      )
    ).toBe(14198);
    const restored = roundTrip(graph);
    expect(restored).toEqual(graph);
    expect([...restored.Graph.keys()]).toEqual([...graph.Graph.keys()]);
  }, 15000);
});
