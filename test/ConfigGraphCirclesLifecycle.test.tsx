import cytoscape, { type Core } from 'cytoscape';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigGraphCircles } from '@components/ConfigGraph/ConfigGraphCircles';
import { GraphUIProvider } from '@components/shared/GraphUIContext';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { useGraphZustand } from '@zustands/GraphZustand';
import type { ConfigGraph } from '@tmfunctions/ConfigGraph';

type ObserverRecord = { callback: () => void; disconnected: boolean };
const renderer = vi.hoisted(() => ({
  width: 1024,
  height: 768,
  cores: [] as Core[],
  observers: [] as ObserverRecord[],
  fit: vi.fn(),
  workerLayout: vi.fn(),
}));

vi.mock('cytoscape', async (original) => {
  const actual = await original<{ default: typeof cytoscape }>();
  return {
    default: (options: cytoscape.CytoscapeOptions) => {
      const cy = actual.default({
        ...options,
        container: undefined,
        headless: true,
        styleEnabled: true,
      });
      renderer.cores.push(cy);
      vi.spyOn(cy, 'fit').mockImplementation(() => {
        renderer.fit(
          cy.nodes().map((node) => ({
            id: node.id(),
            position: { ...node.position() },
          }))
        );
        return cy;
      });
      return cy;
    },
  };
});
vi.mock('@components/shared/layout/elkUtils', async (original) => ({
  ...(await original<typeof import('@components/shared/layout/elkUtils')>()),
  createElkWithWorker: () => ({ terminateWorker: vi.fn() }),
  runElkLayoutWithTimeout: renderer.workerLayout,
}));
vi.mock('@components/ConfigGraph/ConfigGraphControls', () => ({
  ConfigGraphControls: () => null,
}));
vi.mock('@components/ConfigGraph/rendering/styles', () => ({
  getConfigGraphStyles: () => [],
}));
vi.mock('@components/shared/LoadingOverlay', () => ({
  LoadingOverlay: () => <div data-testid="loader" />,
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
function emitResize() {
  renderer.observers
    .filter((observer) => !observer.disconnected)
    .forEach((observer) => observer.callback());
}
async function nextFrame() {
  await act(async () => vi.advanceTimersByTimeAsync(16));
}
function Graph({ active = true }: { active?: boolean }) {
  return (
    <GraphUIProvider active={active}>
      <ConfigGraphCircles active={active} />
    </GraphUIProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  renderer.width = window.innerWidth;
  renderer.height = window.innerHeight;
  renderer.cores = [];
  renderer.observers = [];
  renderer.fit.mockReset();
  renderer.workerLayout.mockReset();
  useGlobalZustand.getState().reset();
  useGraphZustand.getState().reset();
  const config = (state: string) => ({ state, tapes: [], heads: [] });
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
    () => renderer.width
  );
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
    () => renderer.height
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      record: ObserverRecord;
      constructor(callback: () => void) {
        this.record = { callback, disconnected: false };
        renderer.observers.push(this.record);
      }
      observe() {}
      disconnect() {
        this.record.disconnected = true;
      }
    }
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('configuration circle layout and viewport integration', () => {
  it.each([false, true])(
    'retains the initial fit when resize overlaps completion (delayed dimensions: %s)',
    async (delayedDimensions) => {
      const first = deferredLayout();
      const resized = deferredLayout();
      renderer.workerLayout
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(resized.promise);
      if (delayedDimensions) {
        renderer.width = 0;
        renderer.height = 0;
      }
      render(<Graph />);
      await nextFrame();
      expect(renderer.workerLayout).toHaveBeenCalledOnce();

      // ResizeObserver and worker completion can arrive in the same browser turn.
      // The resize starts another layout before the old completion effect runs.
      await act(async () => {
        renderer.width = window.innerWidth + 240;
        renderer.height = window.innerHeight;
        emitResize();
        first.resolve(positions(100));
      });
      expect(renderer.workerLayout).toHaveBeenCalledTimes(2);
      await nextFrame();
      expect(renderer.fit).not.toHaveBeenCalled();
      expect(screen.getByTestId('loader')).toBeInTheDocument();

      await act(async () => resized.resolve(positions(400)));
      await nextFrame();
      expect(renderer.fit).toHaveBeenCalledOnce();
      expect(renderer.fit).toHaveBeenCalledWith(
        expect.arrayContaining([
          { id: 'b', position: expect.objectContaining({ x: 500 }) },
        ])
      );
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    }
  );

  it('completes its first layout in a hidden tab and fits only after returning', async () => {
    const first = deferredLayout();
    renderer.workerLayout.mockReturnValueOnce(first.promise);
    const view = render(<Graph />);
    await nextFrame();
    expect(renderer.workerLayout).toHaveBeenCalledOnce();

    renderer.width = 0;
    renderer.height = 0;
    view.rerender(<Graph active={false} />);
    act(emitResize);
    await act(async () => first.resolve(positions(100)));
    await nextFrame();
    expect(renderer.fit).not.toHaveBeenCalled();
    expect(screen.getByTestId('loader')).toBeInTheDocument();

    renderer.width = window.innerWidth;
    renderer.height = window.innerHeight;
    view.rerender(<Graph />);
    act(emitResize);
    await nextFrame();
    expect(renderer.fit).toHaveBeenCalledOnce();
    expect(renderer.workerLayout).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

  it('waits for the running layout when an initially hidden graph becomes visible', async () => {
    const first = deferredLayout();
    renderer.workerLayout.mockReturnValueOnce(first.promise);
    renderer.width = 0;
    renderer.height = 0;
    const view = render(<Graph active={false} />);
    await nextFrame();
    expect(renderer.workerLayout).toHaveBeenCalledOnce();

    renderer.width = window.innerWidth;
    renderer.height = window.innerHeight;
    view.rerender(<Graph />);
    act(emitResize);
    await nextFrame();
    expect(renderer.fit).not.toHaveBeenCalled();
    expect(screen.getByTestId('loader')).toBeInTheDocument();

    await act(async () => first.resolve(positions(400)));
    await nextFrame();
    expect(renderer.fit).toHaveBeenCalledOnce();
    expect(renderer.workerLayout).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });
});
