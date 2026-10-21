// @vitest-environment node
import { readFile } from 'node:fs/promises';
import type { ElkNode } from '@openedges/elk-layout';
import { beforeAll, describe, expect, it } from 'vitest';

import baseline from './fixtures/elk-layout-baseline.json';

type WasmLayout = {
  default: (input: { module_or_path: Uint8Array }) => Promise<unknown>;
  layout_json: (graph: string, options: string) => string;
};

let wasm: WasmLayout;

beforeAll(async () => {
  const wasmDirectory = new URL('../src/vendor/elk-wasm/', import.meta.url);
  // Exercise the vendored browser binary used by the app, including its Rust
  // fixes, rather than the npm package's original binary or native Node addon.
  const loader = await readFile(
    new URL('org_eclipse_elk_wasm.js', wasmDirectory),
    'utf8'
  );
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(loader).toString('base64')}`;
  wasm = await import(/* @vite-ignore */ moduleUrl);
  await wasm.default({
    module_or_path: await readFile(
      new URL('org_eclipse_elk_wasm_bg.wasm', wasmDirectory)
    ),
  });
});

describe('browser WASM layout compatibility with ELK.js 0.10.0', () => {
  it.each(
    baseline.fixtures.filter(
      ({ input }) => input.layoutOptions['elk.algorithm'] === 'layered'
    )
  )('preserves node positions: $name', ({ input, positions }) => {
    const graph: ElkNode = JSON.parse(wasm.layout_json(JSON.stringify(input), '{}'));
    expect(graph.children?.map(({ id }) => id) ?? []).toEqual(
      positions.map(({ id }) => id)
    );
    for (const expected of positions) {
      const actual = graph.children?.find(({ id }) => id === expected.id);
      expect(actual?.x).toBeCloseTo(expected.x, 6);
      expect(actual?.y).toBeCloseTo(expected.y, 6);
    }
  });
});
