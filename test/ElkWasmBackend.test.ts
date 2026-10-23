import type { ElkNode } from '@openedges/elk-layout';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { initialize, layoutJson, layoutPositionsJson } = vi.hoisted(() => ({
  initialize: vi.fn(),
  layoutJson: vi.fn(),
  layoutPositionsJson: vi.fn(),
}));

vi.mock('../src/vendor/elk-wasm/org_eclipse_elk_wasm.js', () => ({
  default: initialize,
  layout_json: layoutJson,
  layout_positions_json: layoutPositionsJson,
}));

const graph: ElkNode = {
  id: 'root',
  children: [{ id: 'q0', width: 50, height: 50 }],
  edges: [{ id: 'loop', sources: ['q0'], targets: ['q0'] }],
  layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' },
};

beforeEach(() => {
  vi.resetModules();
  initialize.mockReset().mockResolvedValue({});
  layoutJson.mockReset().mockImplementation((serialized) => serialized);
  layoutPositionsJson.mockReset().mockImplementation((serialized) => serialized);
});

describe('local Rust WASM backend', () => {
  it('waits for the first layout before initializing WASM', async () => {
    const { createElkWasmBackend } = await import(
      '@components/shared/layout/elkWasmBackend'
    );
    createElkWasmBackend();
    createElkWasmBackend();
    expect(initialize).not.toHaveBeenCalled();
    expect(layoutJson).not.toHaveBeenCalled();
    expect(layoutPositionsJson).not.toHaveBeenCalled();
  });

  it('shares pending initialization across backend instances and preserves graph options', async () => {
    let finishInitialization!: (value: unknown) => void;
    initialize.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishInitialization = resolve;
        })
    );
    const { createElkWasmBackend } = await import(
      '@components/shared/layout/elkWasmBackend'
    );
    const first = createElkWasmBackend();
    const second = createElkWasmBackend({ positionsOnly: true });
    const requests = [first.layout(graph), second.layout(graph)];
    expect(initialize).toHaveBeenCalledOnce();
    expect(layoutJson).not.toHaveBeenCalled();
    expect(layoutPositionsJson).not.toHaveBeenCalled();

    finishInitialization({});
    await expect(Promise.all(requests)).resolves.toEqual([graph, graph]);
    await expect(first.layout(graph)).resolves.toEqual(graph);
    expect(initialize).toHaveBeenCalledOnce();
    expect(layoutJson).toHaveBeenCalledTimes(2);
    expect(layoutJson).toHaveBeenCalledWith(JSON.stringify(graph), '{}');
    expect(layoutPositionsJson).toHaveBeenCalledOnce();
    expect(layoutPositionsJson).toHaveBeenCalledWith(JSON.stringify(graph), '{}');
  });

  it('returns compact node geometry only when explicitly requested', async () => {
    const projected = {
      id: 'root',
      width: 100,
      height: 120,
      children: [{ id: 'q0', x: 12, y: 20, width: 50, height: 50 }],
    };
    layoutPositionsJson.mockReturnValue(JSON.stringify(projected));
    const { createElkWasmBackend } = await import(
      '@components/shared/layout/elkWasmBackend'
    );
    await expect(
      createElkWasmBackend({ positionsOnly: true }).layout(graph)
    ).resolves.toEqual(projected);
    await expect(createElkWasmBackend().layout(graph)).resolves.toEqual(graph);
    expect(layoutJson).toHaveBeenCalledOnce();
    expect(layoutPositionsJson).toHaveBeenCalledOnce();
    expect(initialize).toHaveBeenCalledOnce();
  });

  it('passes through the Rust full-graph fallback for unsupported position projections', async () => {
    const richGraph = {
      ...graph,
      labels: [{ id: 'label', text: 'Keep full graph data' }],
    };
    layoutPositionsJson.mockReturnValue(JSON.stringify(richGraph));
    const { createElkWasmBackend } = await import(
      '@components/shared/layout/elkWasmBackend'
    );
    await expect(
      createElkWasmBackend({ positionsOnly: true }).layout(richGraph)
    ).resolves.toEqual(richGraph);
    expect(layoutJson).not.toHaveBeenCalled();
  });

  it('rejects every waiter with the original initialization error', async () => {
    const failure = new WebAssembly.CompileError('Unsupported WASM binary');
    initialize.mockRejectedValue(failure);
    const { createElkWasmBackend } = await import(
      '@components/shared/layout/elkWasmBackend'
    );
    const backend = createElkWasmBackend();
    await Promise.all([
      expect(backend.layout(graph)).rejects.toBe(failure),
      expect(backend.layout(graph)).rejects.toBe(failure),
    ]);
    await expect(backend.layout(graph)).rejects.toBe(failure);
    expect(initialize).toHaveBeenCalledOnce();
    expect(layoutJson).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'preserves layout trap names with positionsOnly=%s',
    async (positionsOnly) => {
      const failure = new RangeError('Maximum call stack size exceeded');
      (positionsOnly ? layoutPositionsJson : layoutJson).mockImplementation(() => {
        throw failure;
      });
      const { createElkWasmBackend } = await import(
        '@components/shared/layout/elkWasmBackend'
      );
      await expect(
        createElkWasmBackend({ positionsOnly }).layout(graph)
      ).rejects.toBe(failure);
    }
  );
});
