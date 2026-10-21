// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElkBackend } from '@components/shared/layout/elkBackend';
import type { ElkLayoutOutputOptions } from '@components/shared/layout/elkWorkerClient';
import baseline from './fixtures/elk-layout-baseline.json';

const { wasmConstructed, legacyConstructed, wasmLayout } = vi.hoisted(() => ({
  wasmConstructed: vi.fn(),
  legacyConstructed: vi.fn(),
  wasmLayout: vi.fn(),
}));

vi.mock('@components/shared/layout/elkWasmBackend', () => ({
  createElkWasmBackend: function (options?: ElkLayoutOutputOptions) {
    wasmConstructed(options);
    return { layout: wasmLayout };
  },
}));

vi.mock('elkjs/lib/elk.bundled.js', async (importOriginal) => {
  const { default: Elk } =
    await importOriginal<typeof import('elkjs/lib/elk.bundled.js')>();
  return {
    default: function () {
      legacyConstructed();
      return new Elk();
    },
  };
});

beforeEach(() => {
  wasmConstructed.mockClear();
  legacyConstructed.mockClear();
  wasmLayout.mockReset().mockImplementation(async (graph) => graph);
});

describe('lazy ELK backend selection', () => {
  it('initializes only WASM for normal layouts, sharing concurrent initialization', async () => {
    const backend = createElkBackend();
    expect(wasmConstructed).not.toHaveBeenCalled();
    expect(legacyConstructed).not.toHaveBeenCalled();
    await Promise.all([
      backend.layout({ id: 'default' }),
      backend.layout({
        id: 'short',
        layoutOptions: { 'elk.algorithm': 'layered' },
      }),
      backend.layout({
        id: 'qualified',
        layoutOptions: { 'elk.algorithm': 'org.eclipse.elk.layered' },
      }),
    ]);
    expect(wasmConstructed).toHaveBeenCalledOnce();
    expect(wasmLayout).toHaveBeenCalledTimes(3);
    expect(legacyConstructed).not.toHaveBeenCalled();
  });

  it('reuses independent engines when the developer changes algorithms', async () => {
    const backend = createElkBackend();
    const legacy = baseline.fixtures.find(
      ({ input }) => input.layoutOptions['elk.algorithm'] === 'force'
    )!.input;
    await backend.layout(legacy);
    expect(wasmConstructed).not.toHaveBeenCalled();
    await backend.layout({ id: 'layered' });
    await backend.layout(legacy);
    await backend.layout({ id: 'layered-again' });
    expect(legacyConstructed).toHaveBeenCalledOnce();
    expect(wasmConstructed).toHaveBeenCalledOnce();
  });

  it('passes the requested output mode only to WASM and preserves original node IDs', async () => {
    const backend = createElkBackend({ positionsOnly: true });
    wasmLayout.mockImplementation(async (graph) => ({
      id: graph.id,
      children: graph.children.map(
        ({ id, width, height }: { id: string; width: number; height: number }) => ({
          id,
          width,
          height,
          x: 12,
          y: 20,
        })
      ),
    }));
    await expect(
      backend.layout({
        id: 'original root',
        children: [{ id: 'original node', width: 64, height: 64 }],
      })
    ).resolves.toEqual({
      id: 'original root',
      children: [{ id: 'original node', width: 64, height: 64, x: 12, y: 20 }],
    });
    expect(wasmConstructed).toHaveBeenCalledWith({ positionsOnly: true });

    const legacy = baseline.fixtures.find(
      ({ input }) => input.layoutOptions['elk.algorithm'] === 'force'
    )!.input;
    const result = await backend.layout(legacy);
    expect(result.edges).toHaveLength(legacy.edges.length);
    expect(result.layoutOptions).toEqual(legacy.layoutOptions);
    expect(legacyConstructed).toHaveBeenCalledOnce();
  });

  it.each(['force', 'mrtree', 'stress', 'radial'])(
    'also routes the fully qualified %s ID through legacy ELK',
    async (algorithm) => {
      const backend = createElkBackend();
      await backend.layout({
        id: 'root',
        layoutOptions: { 'elk.algorithm': `org.eclipse.elk.${algorithm}` },
        children: [{ id: 'a', width: 64, height: 64 }],
        edges: [],
      });
      expect(legacyConstructed).toHaveBeenCalledOnce();
      expect(wasmConstructed).not.toHaveBeenCalled();
    }
  );
});

describe('legacy developer layout parity', () => {
  it.each(
    baseline.fixtures.filter(
      ({ input }) => input.layoutOptions['elk.algorithm'] !== 'layered'
    )
  )('preserves exact legacy positions: $name', async ({ input, positions }) => {
    const result = await createElkBackend().layout(input);
    expect(result.children?.map(({ id, x, y }) => ({ id, x, y })) ?? []).toEqual(
      positions
    );
    expect(wasmConstructed).not.toHaveBeenCalled();
  });
});
