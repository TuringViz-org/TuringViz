import { useState, type ReactNode, type CSSProperties } from 'react';
import type { Node } from '@xyflow/react';
import type { ElkNode } from '@openedges/elk-layout';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigGraphCards } from '@components/ConfigGraph/ConfigGraphCards';
import { GraphUIProvider } from '@components/shared/GraphUIContext';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { useGraphZustand } from '@zustands/GraphZustand';
import { ConfigNodeMode } from '@utils/constants';
import type { ConfigGraph } from '@tmfunctions/ConfigGraph';

const state = vi.hoisted(() => ({
  width: 1024,
  height: 768,
  nodes: [] as Node[],
  fit: vi.fn(),
  restore: vi.fn(),
  workerLayout: vi.fn(),
}));
vi.mock('@xyflow/react', async (original) => {
  const actual = await original<typeof import('@xyflow/react')>();
  return {
    ...actual,
    ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
    ReactFlow: ({ style, nodes }: { style: CSSProperties; nodes: Node[] }) => {
      state.nodes = nodes;
      return <div data-testid="graph" style={style} />;
    },
    useNodesInitialized: () => true,
    useNodesState: (initial: unknown[]) => [...useState(initial), () => {}],
    useEdgesState: (initial: unknown[]) => [...useState(initial), () => {}],
    useStore: (select: (value: { width: number; height: number }) => unknown) =>
      select({ width: state.width, height: state.height }),
    useReactFlow: () => flow,
  };
});
const flow = {
  fitView: state.fit,
  setViewport: state.restore,
  getViewport: () => ({ x: 100, y: 100, zoom: 1 }),
  getNodes: () => state.nodes,
};
vi.mock('@components/shared/layout/elkUtils', async (original) => ({
  ...(await original<typeof import('@components/shared/layout/elkUtils')>()),
  createElkWithWorker: () => ({ terminateWorker: vi.fn() }),
  runElkLayoutWithTimeout: state.workerLayout,
}));
vi.mock('@components/ConfigGraph/ConfigGraphControls', () => ({
  ConfigGraphControls: () => null,
}));

function deferredLayout() {
  let resolve!: (graph: ElkNode) => void;
  const promise = new Promise<ElkNode>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function positions(offset: number): ElkNode {
  return {
    id: 'root',
    children: [
      { id: 'a', x: offset, y: 20 },
      { id: 'b', x: offset + 100, y: 120 },
      { id: 'c', x: offset + 200, y: 120 },
    ],
  };
}
function Graph({ active = true }: { active?: boolean }) {
  return (
    <GraphUIProvider active={active}>
      <ConfigGraphCards active={active} />
    </GraphUIProvider>
  );
}
async function advance(milliseconds = 200) {
  await act(async () => vi.advanceTimersByTimeAsync(milliseconds));
}

beforeEach(() => {
  vi.useFakeTimers();
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  state.nodes = [];
  state.fit.mockReset().mockResolvedValue(true);
  state.restore.mockReset().mockResolvedValue(true);
  state.workerLayout.mockReset();
  useGlobalZustand.getState().reset();
  useGraphZustand.getState().reset();
  useGraphZustand.getState().setConfigGraphNodeMode(ConfigNodeMode.CARDS);
  const config = (name: string) => ({ state: name, tapes: [], heads: [] });
  const graph: ConfigGraph = {
    startconfig: config('a'),
    startconfighash: 'a',
    Graph: new Map([
      [
        'a',
        {
          config: config('a'),
          computed: true,
          next: [
            ['b', 0],
            ['c', 1],
          ],
        },
      ],
      ['b', { config: config('b'), computed: true, next: [] }],
      ['c', { config: config('c'), computed: true, next: [] }],
    ]),
  };
  useGlobalZustand.setState({ configGraph: graph });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    () => state.width
  );
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
    () => state.height
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('configuration card layout and viewport integration', () => {
  it('retains its initial fit when viewport resize overlaps layout completion', async () => {
    const first = deferredLayout();
    const resized = deferredLayout();
    state.workerLayout
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(resized.promise);
    render(<Graph />);
    await advance(16);
    expect(state.workerLayout).toHaveBeenCalledOnce();

    // React Flow's new dimensions and the worker result become visible together.
    await act(async () => {
      state.width += 240;
      first.resolve(positions(100));
    });
    expect(state.workerLayout).toHaveBeenCalledTimes(2);
    await advance();
    expect(state.fit).not.toHaveBeenCalled();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '0' });

    await act(async () => resized.resolve(positions(400)));
    await advance();
    await advance();
    expect(state.fit).toHaveBeenCalledOnce();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });
  });

  it('finishes in the background and reveals after returning to a resized tab', async () => {
    const first = deferredLayout();
    const resized = deferredLayout();
    state.workerLayout
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(resized.promise);
    const view = render(<Graph />);
    await advance(16);
    expect(state.workerLayout).toHaveBeenCalledOnce();

    state.width = 0;
    state.height = 0;
    view.rerender(<Graph active={false} />);
    await act(async () => first.resolve(positions(100)));
    await advance();
    expect(state.fit).not.toHaveBeenCalled();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '0' });

    state.width = window.innerWidth + 240;
    state.height = window.innerHeight;
    view.rerender(<Graph />);
    expect(state.workerLayout).toHaveBeenCalledTimes(2);
    await advance();
    expect(state.fit).not.toHaveBeenCalled();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '0' });

    await act(async () => resized.resolve(positions(400)));
    await advance();
    await advance();
    expect(state.fit).toHaveBeenCalledOnce();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });
  });

  it('retains the settled viewport restore when a later resize overlaps completion', async () => {
    const first = deferredLayout();
    const resized = deferredLayout();
    const resizedAgain = deferredLayout();
    state.workerLayout
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(resized.promise)
      .mockReturnValueOnce(resizedAgain.promise);
    const view = render(<Graph />);
    await advance(16);
    await act(async () => first.resolve(positions(100)));
    await advance();
    await advance();
    expect(state.fit).toHaveBeenCalledOnce();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });

    state.width += 240;
    view.rerender(<Graph />);
    expect(state.workerLayout).toHaveBeenCalledTimes(2);
    await act(async () => {
      state.width += 240;
      resized.resolve(positions(200));
    });
    expect(state.workerLayout).toHaveBeenCalledTimes(3);
    await advance();
    expect(state.restore).not.toHaveBeenCalled();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '0' });

    await act(async () => resizedAgain.resolve(positions(400)));
    await advance();
    await advance();
    expect(state.fit).toHaveBeenCalledOnce();
    expect(state.restore).toHaveBeenCalledExactlyOnceWith(
      { x: 100, y: 100, zoom: 1 },
      { duration: 0 }
    );
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });
  });
});
