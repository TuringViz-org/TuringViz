import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  configurationHashFromNodeId,
  useCurrentConfigHighlight,
} from '@hooks/useCurrentConfigHighlight';
import { hashConfig, type Configuration } from '@mytypes/TMTypes';

vi.mock('@mytypes/TMTypes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mytypes/TMTypes')>();
  return { ...actual, hashConfig: vi.fn(actual.hashConfig) };
});

describe('current configuration highlight', () => {
  it('indexes a large graph once and retains edges, positions and other nodes', () => {
    const nodes = Array.from({ length: 17000 }, (_, id) => ({
      id: String(id),
      position: { x: id * 80, y: 0 },
      data: {
        config: { state: `q${id}`, tapes: [[[], []]], heads: [0] } as Configuration,
        isCurrent: false,
      },
    }));
    const base = { nodes, edges: [], topoKey: 'unchanged' };
    vi.mocked(hashConfig).mockClear();
    const view = renderHook(
      ({ config }) => useCurrentConfigHighlight(base, config),
      {
        initialProps: { config: nodes[0].data.config },
      }
    );
    expect(hashConfig).toHaveBeenCalledTimes(17001);
    view.rerender({ config: nodes[1].data.config });
    expect(hashConfig).toHaveBeenCalledTimes(17002);
    expect(view.result.current.edges).toBe(base.edges);
    expect(view.result.current.topoKey).toBe(base.topoKey);
    expect(view.result.current.nodes[1].position).toBe(nodes[1].position);
    expect(view.result.current.nodes[0]).toBe(nodes[0]);
    expect(view.result.current.nodes[100]).toBe(nodes[100]);
    expect(view.result.current.nodes[1].data.isCurrent).toBe(true);
  });

  it('highlights every occurrence of a configuration in a computation tree', () => {
    const config: Configuration = { state: 'loop', tapes: [[[], []]], heads: [0] };
    const base = {
      nodes: [0, 1].map((id) => ({
        id: String(id),
        position: { x: 0, y: 0 },
        data: { config, isCurrent: false },
      })),
    };
    const view = renderHook(() => useCurrentConfigHighlight(base, config));
    expect(view.result.current.nodes.every((node) => node.data.isCurrent)).toBe(
      true
    );
  });

  it('reuses configuration graph IDs with identical highlights while stepping', () => {
    const nodes = Array.from({ length: 1000 }, (_, index) => {
      const config: Configuration = {
        state: `q${index}`,
        tapes: [[[{ value: 'a' }], [{ value: 'b' }, { value: '_' }]]],
        heads: [index % 3],
      };
      return {
        id: hashConfig(config),
        position: { x: index * 80, y: 40 },
        data: { config, isCurrent: false },
      };
    });
    const base = {
      nodes,
      edges: [{ id: 'edge', source: nodes[0].id, target: nodes[1].id }],
      topoKey: 'unchanged',
    };
    const original = renderHook(
      ({ config }) => useCurrentConfigHighlight(base, config),
      { initialProps: { config: nodes[0].data.config } }
    );
    vi.mocked(hashConfig).mockClear();
    const optimized = renderHook(
      ({ config }) =>
        useCurrentConfigHighlight(base, config, configurationHashFromNodeId),
      { initialProps: { config: nodes[0].data.config } }
    );
    expect(hashConfig).toHaveBeenCalledOnce();
    expect(optimized.result.current).toEqual(original.result.current);

    original.rerender({ config: nodes[1].data.config });
    vi.mocked(hashConfig).mockClear();
    optimized.rerender({ config: nodes[1].data.config });
    expect(hashConfig).toHaveBeenCalledOnce();
    expect(optimized.result.current).toEqual(original.result.current);
    expect(optimized.result.current.edges).toBe(base.edges);
    expect(optimized.result.current.nodes[0]).toBe(base.nodes[0]);
    expect(optimized.result.current.nodes[1].position).toBe(nodes[1].position);
    expect(optimized.result.current.nodes[20]).toBe(base.nodes[20]);

    const absent = { ...nodes[0].data.config, state: 'not in graph' };
    original.rerender({ config: absent });
    optimized.rerender({ config: absent });
    expect(optimized.result.current).toBe(base);
    expect(optimized.result.current).toEqual(original.result.current);
  });
});
