import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGraphElkLayout } from '@components/shared/layout/useGraphElkLayout';

const layoutMock = vi.hoisted(() => vi.fn());
const createWorkerMock = vi.hoisted(() =>
  vi.fn(() => ({ terminateWorker: vi.fn() }))
);
const warningMock = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { warning: warningMock } }));
vi.mock('@components/shared/layout/elkUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@components/shared/layout/elkUtils')>()),
  createElkWithWorker: createWorkerMock,
  runElkLayoutWithTimeout: layoutMock,
}));

const nodes = ['a', 'b', 'c'].map((id) => ({
  id,
  position: { x: 0, y: 0 },
  data: {},
}));
const edges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'ac', source: 'a', target: 'c' },
];
const resultGraph: ElkNode = {
  id: 'root',
  children: [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 10, y: 20 },
    { id: 'c', x: 30, y: 40 },
  ],
};
function deferred() {
  let resolve!: (value: ElkNode) => void;
  const promise = new Promise<ElkNode>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const options = { nodes, edges, autoRun: false, autoDirection: false };

describe('Graph ELK layout lifecycle', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    layoutMock.mockReset();
    createWorkerMock.mockClear();
    warningMock.mockReset();
  });

  it('coalesces restarts, discards stale positions and reads the newest options', async () => {
    const first = deferred();
    const onLayout = vi.fn();
    layoutMock.mockReturnValueOnce(first.promise).mockResolvedValueOnce(resultGraph);
    const { result, rerender } = renderHook(
      ({ padding, direction }: { padding: number; direction: 'DOWN' | 'RIGHT' }) =>
        useGraphElkLayout({ ...options, padding, direction, onLayout }),
      { initialProps: { padding: 24, direction: 'DOWN' } }
    );
    const restart = result.current.restart;
    act(() => restart());
    rerender({ padding: 90, direction: 'RIGHT' });
    expect(result.current.restart).toBe(restart);
    act(() => {
      restart();
      restart();
      restart();
    });
    expect(layoutMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      first.resolve(resultGraph);
    });

    await waitFor(() => expect(result.current.running).toBe(false));
    expect(layoutMock).toHaveBeenCalledTimes(2);
    expect(layoutMock.mock.calls[1]![1].layoutOptions).toMatchObject({
      'elk.padding': '90',
      'elk.direction': 'RIGHT',
    });
    expect(onLayout).toHaveBeenCalledTimes(1);
    expect(result.current.completedLayouts).toBe(1);
  });

  it('rejects a result after its topology changed even before a debounced restart', async () => {
    const first = deferred();
    const onLayout = vi.fn();
    layoutMock.mockReturnValueOnce(first.promise);
    const { result, rerender } = renderHook(
      ({ graphNodes }) =>
        useGraphElkLayout({ ...options, nodes: graphNodes, onLayout }),
      { initialProps: { graphNodes: nodes } }
    );
    act(() => result.current.restart());
    rerender({
      graphNodes: [...nodes, { id: 'd', position: { x: 0, y: 0 }, data: {} }],
    });
    await act(async () => {
      first.resolve(resultGraph);
    });
    expect(onLayout).not.toHaveBeenCalled();
    expect(result.current.completedLayouts).toBe(0);
    expect(result.current.running).toBe(false);
  });

  it('applies a pending result through the latest committed callback', async () => {
    const pending = deferred();
    const previousCallback = vi.fn();
    const latestCallback = vi.fn();
    layoutMock.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ onLayout }) => useGraphElkLayout({ ...options, onLayout }),
      { initialProps: { onLayout: previousCallback } }
    );
    act(() => result.current.restart());
    rerender({ onLayout: latestCallback });
    await act(async () => {
      pending.resolve(resultGraph);
    });
    expect(previousCallback).not.toHaveBeenCalled();
    expect(latestCallback).toHaveBeenCalledTimes(1);
  });

  it('finishes background jobs using the last visible viewport after a panel reports 0x0', async () => {
    const pending = deferred();
    const onLayout = vi.fn();
    layoutMock
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(resultGraph);
    const { result, rerender } = renderHook(
      ({ active }) =>
        useGraphElkLayout({
          ...options,
          autoDirection: true,
          scaleToFit: true,
          autoResizeLayoutEnabled: active,
          viewportWidth: active ? 900 : 0,
          viewportHeight: active ? 300 : 0,
          onLayout,
        }),
      { initialProps: { active: true } }
    );
    act(() => result.current.restart());
    rerender({ active: false });
    act(() => result.current.restart());
    await act(async () => {
      pending.resolve(resultGraph);
    });
    expect(onLayout).toHaveBeenCalledExactlyOnceWith(
      new Map([
        ['a', { x: -45, y: 0 }],
        ['b', { x: -5, y: 20 }],
        ['c', { x: 75, y: 40 }],
      ])
    );
    expect(result.current.completedLayouts).toBe(1);
    rerender({ active: true });
    expect(layoutMock).toHaveBeenCalledTimes(2);
  });

  it('provides recovery positions when a layout fails inside a hidden panel', async () => {
    const onLayout = vi.fn();
    layoutMock.mockRejectedValueOnce(new Error('worker failed'));
    const { result } = renderHook(() =>
      useGraphElkLayout({
        ...options,
        containerRef: { current: document.createElement('div') },
        autoResizeLayoutEnabled: false,
        onLayout,
      })
    );
    act(() => result.current.restart());
    await waitFor(() => expect(result.current.completedLayouts).toBe(1));
    expect(onLayout).toHaveBeenCalledExactlyOnceWith(
      new Map([
        ['a', { x: 24, y: 24 }],
        ['b', { x: 24, y: 208 }],
        ['c', { x: 158, y: 208 }],
      ])
    );
  });

  it('retries a document-suspended failure when the browser becomes visible', async () => {
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');
    const onLayout = vi.fn();
    layoutMock
      .mockRejectedValueOnce(new Error('worker suspended'))
      .mockResolvedValueOnce(resultGraph);
    const { result } = renderHook(() => useGraphElkLayout({ ...options, onLayout }));
    act(() => result.current.restart());
    await waitFor(() => expect(result.current.running).toBe(false));
    expect(onLayout).not.toHaveBeenCalled();
    expect(warningMock).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(result.current.completedLayouts).toBe(1));
    expect(onLayout).toHaveBeenCalledOnce();
  });

  it('isolates StrictMode replacement work from the discarded lifecycle', async () => {
    const discarded = deferred();
    const replacement = deferred();
    const onLayout = vi.fn();
    layoutMock
      .mockReturnValueOnce(discarded.promise)
      .mockReturnValueOnce(replacement.promise);
    const { result } = renderHook(
      () => useGraphElkLayout({ ...options, autoRun: true, onLayout }),
      { wrapper: StrictMode }
    );
    expect(layoutMock).toHaveBeenCalledTimes(2);
    expect(layoutMock.mock.calls[0]![3].aborted).toBe(true);
    expect(layoutMock.mock.calls[1]![3].aborted).toBe(false);
    await act(async () => {
      discarded.resolve(resultGraph);
    });
    expect(onLayout).not.toHaveBeenCalled();
    expect(result.current.running).toBe(true);
    await act(async () => {
      replacement.resolve(resultGraph);
    });
    expect(onLayout).toHaveBeenCalledTimes(1);
    expect(result.current.running).toBe(false);
    expect(result.current.completedLayouts).toBe(1);
  });
});
