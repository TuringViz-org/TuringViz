// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { ElkNode } from '@openedges/elk-layout';
import { beforeAll, describe, expect, it } from 'vitest';

import { compactElkGraph } from '@components/shared/layout/elkCompactGraph';
import { buildElkGraph } from '@components/shared/layout/graphLayout';
import { getConfigNodeLayoutSize } from '@components/shared/layout/configNodeLayout';
import { buildConfigGraph } from '@components/ConfigGraph/util/buildConfigGraph';
import { computeConfigGraph } from '@tmfunctions/configGraphModel';
import { NonDetSAT } from '@utils/ExampleTMs';
import {
  ConfigNodeMode,
  DEFAULT_CONFIG_GRAPH_TARGET_NODES,
  DEFAULT_GRAPH_NODES_ELK_OPTS,
} from '@utils/constants';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { loadTuringMachineFromSource } from '../src/tmLanguage/loadMachine';
import baseline from './fixtures/elk-layout-baseline.json';

type WasmLayout = {
  default: (input: { module_or_path: Uint8Array }) => Promise<unknown>;
  layout_json: (graph: string, options: string) => string;
  layout_positions_json: (graph: string, options: string) => string;
};

let wasm: WasmLayout;
const wasmDirectory = new URL('../src/vendor/elk-wasm/', import.meta.url);

beforeAll(async () => {
  const loader = await readFile(
    new URL('org_eclipse_elk_wasm.js', wasmDirectory),
    'utf8'
  );
  // Exercise the vendored browser binary, including its Rust fixes.
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(loader).toString('base64')}`;
  wasm = await import(/* @vite-ignore */ moduleUrl);
  await wasm.default({
    module_or_path: await readFile(
      new URL('org_eclipse_elk_wasm_bg.wasm', wasmDirectory)
    ),
  });
});

const layout = (graph: ElkNode): ElkNode =>
  JSON.parse(wasm.layout_json(JSON.stringify(graph), '{}'));

const nodeGeometry = ({ id, x, y, width, height }: ElkNode) => ({
  id,
  x,
  y,
  width,
  height,
});

function expectSameGeometry(actual: ElkNode, expected: ElkNode) {
  expect(nodeGeometry(actual)).toEqual(nodeGeometry(expected));
  expect(actual.children?.map(nodeGeometry)).toEqual(
    expected.children?.map(nodeGeometry)
  );
}

function layoutWithSmallStack(
  graphJson: string,
  positionsOnly = false
): Promise<string> {
  const worker = new Worker(
    `
      const { readFileSync } = require('node:fs');
      const { parentPort, workerData } = require('node:worker_threads');
      (async () => {
        try {
          const source = readFileSync(workerData.loader, 'utf8');
          const wasm = await import(
            'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
          );
          await wasm.default({ module_or_path: readFileSync(workerData.binary) });
          const layout = workerData.positionsOnly
            ? wasm.layout_positions_json
            : wasm.layout_json;
          parentPort.postMessage({ result: layout(workerData.graph, '{}') });
        } catch (error) {
          parentPort.postMessage({ error: error.stack || error.message });
        }
      })();
    `,
    {
      eval: true,
      // Leave enough stack for Node's loader while exposing recursive graph
      // traversals. The original binary overflows on the deep-chain regression.
      resourceLimits: { stackSizeMb: 1 },
      workerData: {
        loader: fileURLToPath(new URL('org_eclipse_elk_wasm.js', wasmDirectory)),
        binary: fileURLToPath(
          new URL('org_eclipse_elk_wasm_bg.wasm', wasmDirectory)
        ),
        graph: graphJson,
        positionsOnly,
      },
    }
  );
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      void worker.terminate();
      reject(new Error('The constrained-stack WASM layout did not finish'));
    }, 20000);
    const finish = () => {
      clearTimeout(deadline);
      void worker.terminate();
    };
    worker.once('message', (message: { result?: string; error?: string }) => {
      finish();
      if (message.error) reject(new Error(message.error));
      else resolve(message.result!);
    });
    worker.once('error', (error) => {
      finish();
      reject(error);
    });
    worker.once('exit', (code) => {
      clearTimeout(deadline);
      // After a message this Promise is already settled. Before one, any exit
      // must reject so a bootstrap failure cannot leave the test hanging.
      reject(new Error(`WASM worker exited before replying (code ${code})`));
    });
  });
}

describe('compact flat ELK graphs', () => {
  it('restores all graph references, including linked edge sections, without modifying the input', () => {
    const input: ElkNode = {
      id: 'original root',
      layoutOptions: { 'elk.algorithm': 'layered' },
      children: [
        { id: 'original source', width: 64, height: 64 },
        { id: 'original target', width: 80, height: 90 },
      ],
      edges: [
        {
          id: 'original edge',
          sources: ['original source'],
          targets: ['original target'],
          container: 'original root',
        },
      ],
    };
    const snapshot = structuredClone(input);
    const { graph, restore } = compactElkGraph(input);
    const [source, target] = graph.children!;
    const edge = graph.edges![0];
    const result: ElkNode = {
      ...graph,
      width: 200,
      height: 130,
      children: [
        { ...source, x: 12, y: 15 },
        { ...target, x: 100, y: 20 },
      ],
      edges: [
        {
          ...edge,
          sections: [
            {
              id: `${edge.id}_s0`,
              startPoint: { x: 76, y: 47 },
              endPoint: { x: 90, y: 47 },
              incomingShape: source.id,
              outgoingSections: [`${edge.id}_s1`],
            },
            {
              id: `${edge.id}_s1`,
              startPoint: { x: 90, y: 47 },
              endPoint: { x: 100, y: 65 },
              outgoingShape: target.id,
              incomingSections: [`${edge.id}_s0`],
            },
          ],
        },
      ],
    };
    const restored = restore(result);
    expect(restored.id).toBe(input.id);
    expect(restored.children).toEqual([
      { ...input.children![0], x: 12, y: 15 },
      { ...input.children![1], x: 100, y: 20 },
    ]);
    expect(restored.edges![0]).toMatchObject({
      ...input.edges![0],
      sections: [
        {
          id: 'original edge_s0',
          incomingShape: 'original source',
          outgoingSections: ['original edge_s1'],
        },
        {
          id: 'original edge_s1',
          outgoingShape: 'original target',
          incomingSections: ['original edge_s0'],
        },
      ],
    });
    expect(restored.width).toBe(200);
    expect(restored.height).toBe(130);
    expect(input).toEqual(snapshot);
    expect(result.children![0].id).toBe(source.id);
    expect(graph.layoutOptions).not.toBe(input.layoutOptions);
    expect(edge.sources).not.toBe(input.edges![0].sources);
  });

  it.each([
    { id: 'root', children: [{ id: 'parent', children: [{ id: 'child' }] }] },
    { id: 'root', children: [{ id: 'node', ports: [{ id: 'port' }] }] },
    { id: 'root', children: [{ id: 'node', labels: [{ text: 'label' }] }] },
    { id: 'root', children: [{ id: 'same' }, { id: 'same' }] },
    {
      id: 'root',
      children: [{ id: 'node' }],
      edges: [{ id: 'edge', sources: ['node'], targets: ['missing'] }],
    },
    {
      id: 'root',
      layoutOptions: { 'elk.layered.crossingMinimization.inLayerPredOf': 'node' },
    },
    { id: 'root', layoutOptions: { 'elk.algorithm': 'force' } },
  ] as ElkNode[])('leaves unsupported inputs unchanged: %j', (input) => {
    const compact = compactElkGraph(input);
    expect(compact.graph).toBe(input);
    const result = { ...input, width: 200 };
    expect(compact.restore(result)).toBe(result);
  });

  it.each([
    {
      id: 'root',
      children: [
        { id: 'parent', children: [{ id: 'child', width: 50, height: 50 }] },
      ],
    },
    {
      id: 'root',
      children: [
        {
          id: 'node',
          width: 50,
          height: 50,
          ports: [{ id: 'port', width: 5, height: 5 }],
        },
      ],
    },
    {
      id: 'root',
      children: [
        {
          id: 'node',
          width: 50,
          height: 50,
          labels: [{ text: 'label', width: 40, height: 20 }],
        },
      ],
    },
  ] as ElkNode[])(
    'keeps the complete exporter for unsupported positions-only inputs: %j',
    (input) => {
      const graph = {
        ...input,
        layoutOptions: { 'elk.algorithm': 'layered' },
      };
      expect(
        JSON.parse(wasm.layout_positions_json(JSON.stringify(graph), '{}'))
      ).toEqual(layout(graph));
    }
  );

  it.each(
    baseline.fixtures.filter(
      ({ input }) => input.layoutOptions['elk.algorithm'] === 'layered'
    )
  )(
    'preserves browser WASM output and legacy coordinates: $name',
    ({ input, positions }) => {
      const { graph, restore } = compactElkGraph(input);
      const restored = restore(layout(graph));
      expect(restored).toEqual(layout(input));
      const positionsOnly = restore(
        JSON.parse(wasm.layout_positions_json(JSON.stringify(graph), '{}'))
      );
      // Exact double values and input order, without rounding or tolerance.
      expectSameGeometry(positionsOnly, restored);
      expect(positionsOnly.edges).toBeUndefined();
      expect(restored.children?.map(({ id }) => id) ?? []).toEqual(
        positions.map(({ id }) => id)
      );
      const actual = new Map(restored.children?.map((node) => [node.id, node]));
      for (const expected of positions) {
        expect(actual.get(expected.id)?.x).toBeCloseTo(expected.x, 6);
        expect(actual.get(expected.id)?.y).toBeCloseTo(expected.y, 6);
      }
    }
  );

  it('lays out a 10,000-node chain without recursive traversal stack overflow', async () => {
    const count = 10000;
    const graph: ElkNode = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
      },
      children: Array.from({ length: count }, (_, index) => ({
        id: `n${index}`,
        width: 64,
        height: 64,
      })),
      edges: Array.from({ length: count - 1 }, (_, index) => ({
        id: `e${index}`,
        sources: [`n${index}`],
        targets: [`n${index + 1}`],
      })),
    };
    const result: ElkNode = JSON.parse(
      await layoutWithSmallStack(JSON.stringify(graph))
    );
    expect(result.children).toHaveLength(count);
    for (const [index, node] of result.children!.entries()) {
      expect({ id: node.id, x: node.x, y: node.y }).toEqual({
        id: `n${index}`,
        x: 12 + index * 84,
        y: 12,
      });
    }
  }, 30000);

  it('lays out a deep graph with merging paths without network-simplex stack overflow', async () => {
    const count = 5000;
    const nodes = Array.from({ length: count }, (_, index) => ({
      id: String(index),
      width: 64,
      height: 64,
      position: { x: 0, y: 0 },
      data: {},
    }));
    const edges = nodes.flatMap((node, index) =>
      [1, 2]
        .filter((step) => index + step < count)
        .map((step) => ({
          id: `e${index}-${step}`,
          source: node.id,
          target: String(index + step),
        }))
    );
    // Unlike a simple chain, merging paths cannot be removed as subtrees before
    // NetworkSimplex::tight_tree_dfs. This caught a second recursive code path.
    const graph = buildElkGraph(nodes, edges, getConfigNodeLayoutSize, {
      ...DEFAULT_GRAPH_NODES_ELK_OPTS,
      algorithm: 'layered',
      direction: 'RIGHT',
    });
    const result: ElkNode = JSON.parse(
      await layoutWithSmallStack(JSON.stringify(graph))
    );
    expect(result.children).toHaveLength(count);
    expect(result.edges).toHaveLength(9997);
    expect(result.width).toBe(500180);
    expect(result.height).toBeCloseTo(515.8333333333333, 6);
    const digest = createHash('sha256');
    for (const [index, node] of result.children!.entries()) {
      expect(node.id).toBe(String(index));
      digest.update(`${index}:${node.x!.toFixed(6)}:${node.y!.toFixed(6)};`);
    }
    // Captured independently with ELK.js 0.10.0 and the original WASM binary
    // using a larger stack; both engines agree on every rounded position.
    expect(digest.digest('hex')).toBe(
      '51510b4132a5abc1cea96821d170d685d56ada7421adba02a3dd3f5d0de9abb1'
    );
  }, 30000);

  it('lays out full NonDetSAT with a small stack, small messages, and unchanged positions', async () => {
    const previousState = useGlobalZustand.getState();
    try {
      expect(loadTuringMachineFromSource(NonDetSAT.code)).toEqual([]);
      const state = useGlobalZustand.getState();
      const configurations = computeConfigGraph(
        state.configGraph!.startconfig,
        DEFAULT_CONFIG_GRAPH_TARGET_NODES,
        state.transitions,
        state.numberOfTapes,
        state.blank
      );
      const { nodes, edges } = buildConfigGraph(
        configurations,
        state.transitions,
        null,
        ConfigNodeMode.NODES
      );
      const input = buildElkGraph(nodes, edges, getConfigNodeLayoutSize, {
        ...DEFAULT_GRAPH_NODES_ELK_OPTS,
        algorithm: 'layered',
        direction: 'RIGHT',
      });
      expect(input.children).toHaveLength(14199);
      expect(input.edges).toHaveLength(14198);
      const { graph, restore } = compactElkGraph(input);
      const compactJson = JSON.stringify(graph);
      // The uncompressed input is 49 MiB and produces 90 MiB of output JSON.
      expect(compactJson.length).toBeLessThan(2 * 1024 * 1024);
      const resultJson = await layoutWithSmallStack(compactJson);
      expect(resultJson.length).toBeLessThan(8 * 1024 * 1024);
      const result = restore(JSON.parse(resultJson));
      const positionsJson = await layoutWithSmallStack(compactJson, true);
      expect(positionsJson.length).toBeLessThan(resultJson.length / 3);
      const positionsOnly = restore(JSON.parse(positionsJson));
      expectSameGeometry(positionsOnly, result);
      expect(positionsOnly.edges).toBeUndefined();
      expect(result.children?.map(({ id }) => id)).toEqual(
        input.children!.map(({ id }) => id)
      );
      expect(result.width).toBe(85488);
      expect(result.height).toBe(6892);
      const digest = createHash('sha256');
      for (const [index, node] of result.children!.entries()) {
        expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
        digest.update(`${index}:${node.x!.toFixed(6)}:${node.y!.toFixed(6)};`);
      }
      // All 14,199 legacy ELK.js 0.10.0 positions, rounded to 1e-6.
      expect(digest.digest('hex')).toBe(
        '3faaf0aaeb0211f9ead68ebe09dff6412b9cc736c50c5b23c062912ead913e12'
      );
    } finally {
      useGlobalZustand.setState(previousState, true);
    }
  }, 30000);
});
