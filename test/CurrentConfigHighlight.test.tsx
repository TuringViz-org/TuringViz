import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCurrentConfigHighlight } from '@hooks/useCurrentConfigHighlight';
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
});
