import cytoscape, { type Core } from 'cytoscape';
import type { ElkNode } from '@openedges/elk-layout';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigGraphCircles } from '@components/ConfigGraph/ConfigGraphCircles';
import { GraphUIProvider, useGraphUI } from '@components/shared/GraphUIContext';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { useGraphZustand } from '@zustands/GraphZustand';
import type { ConfigGraph } from '@tmfunctions/ConfigGraph';
import { PORTAL_BRIDGE_SWITCH_EVENT } from '@components/MainPage/PortalBridge';
import { ensureStartNodeVisible } from '@components/shared/cytoscapeViewport';

type ObserverRecord = { callback: () => void; disconnected: boolean };
const renderer = vi.hoisted(() => ({
  width: 1024,
  height: 768,
  cores: [] as Core[],
  realFits: new Map<Core, Core['fit']>(),
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
      renderer.realFits.set(cy, cy.fit.bind(cy));
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
vi.mock('@components/shared/ConfigurationDetailPopper', () => ({
  ConfigurationDetailPopper: () => null,
}));

function deferredLayout() {
  let resolve!: (graph: ElkNode) => void;
  const promise = new Promise<ElkNode>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function positions(offset: number, ids = ['a', 'b', 'c']): ElkNode {
  return {
    id: 'root',
    children: [
      { id: ids[0], x: offset, y: 20 },
      { id: ids[1], x: offset + 100, y: 120 },
      { id: ids[2], x: offset + 200, y: 120 },
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
function SelectBeforeInsertion() {
  const { setSelected, setHighlightedEdgeId } = useGraphUI();
  return (
    <button
      onClick={() => {
        setSelected({ type: 'node', id: 'a' });
        setHighlightedEdgeId('a→b#0');
      }}
    >
      Select before insertion
    </button>
  );
}
function Graph({
  active = true,
  selection = false,
}: {
  active?: boolean;
  selection?: boolean;
}) {
  return (
    <GraphUIProvider active={active}>
      <ConfigGraphCircles active={active} />
      {selection && <SelectBeforeInsertion />}
    </GraphUIProvider>
  );
}

function branchingGraph(ids = ['a', 'b', 'c']): ConfigGraph {
  const config = (state: string) => ({ state, tapes: [], heads: [] });
  return {
    startconfig: config(ids[0]),
    startconfighash: ids[0],
    Graph: new Map([
      [
        ids[0],
        {
          config: config(ids[0]),
          computed: true,
          next: [
            [ids[1], 0],
            [ids[2], 1],
          ],
        },
      ],
      [ids[1], { config: config(ids[1]), computed: true, next: [] }],
      [ids[2], { config: config(ids[2]), computed: true, next: [] }],
    ]),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  renderer.width = window.innerWidth;
  renderer.height = window.innerHeight;
  renderer.cores = [];
  renderer.realFits.clear();
  renderer.observers = [];
  renderer.fit.mockReset();
  renderer.workerLayout.mockReset();
  useGlobalZustand.getState().reset();
  useGraphZustand.getState().reset();
  useGlobalZustand.setState({ configGraph: branchingGraph() });
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
  it('inserts only positioned elements and applies selection requested before insertion', async () => {
    const first = deferredLayout();
    renderer.workerLayout.mockReturnValueOnce(first.promise);
    render(<Graph selection />);
    const cy = renderer.cores.at(-1)!;
    expect(cy.elements()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Select before insertion' }));
    await nextFrame();
    expect(cy.elements()).toHaveLength(0);
    expect(renderer.fit).not.toHaveBeenCalled();

    const insertedPositions: unknown[] = [];
    cy.on('add', 'node', (event) => {
      insertedPositions.push({
        id: event.target.id(),
        position: { ...event.target.position() },
      });
    });
    await act(async () => first.resolve(positions(100)));
    expect(cy.nodes()).toHaveLength(3);
    expect(insertedPositions).toEqual(
      cy.nodes().map((node) => ({ id: node.id(), position: { ...node.position() } }))
    );
    expect(cy.getElementById('a').hasClass('ct-selected')).toBe(true);
    expect(cy.getElementById('a→b#0').hasClass('ct-highlighted')).toBe(true);
    await nextFrame();
    expect(renderer.fit).toHaveBeenCalledWith(insertedPositions);
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

  it.each([100, 100_000])(
    'fits exact viewport geometry and pending selection before an already queued renderer frame (spread: %s)',
    async (spread) => {
      const first = deferredLayout();
      renderer.workerLayout.mockReturnValueOnce(first.promise);
      render(<Graph selection />);
      await nextFrame();
      const cy = renderer.cores.at(-1)!;
      vi.spyOn(cy, 'width').mockImplementation(() => renderer.width);
      vi.spyOn(cy, 'height').mockImplementation(() => renderer.height);
      const interactionStateAtFit: { selected: boolean; highlighted: boolean }[] =
        [];
      vi.mocked(cy.fit).mockImplementation((elements, padding) => {
        interactionStateAtFit.push({
          selected: cy.getElementById('a').hasClass('ct-selected'),
          highlighted: cy.getElementById('a→b#0').hasClass('ct-highlighted'),
        });
        renderer.fit();
        return renderer.realFits.get(cy)!(elements, padding);
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Select before insertion' })
      );

      // Cytoscape already has a renderer RAF loop. Its next callback may precede
      // a newly scheduled fit RAF, so it must observe the fitted commit directly.
      const draw = vi.fn(() => ({
        fitCalls: renderer.fit.mock.calls.length,
        nodeCount: cy.nodes().length,
        selected: cy.getElementById('a').hasClass('ct-selected'),
        highlighted: cy.getElementById('a→b#0').hasClass('ct-highlighted'),
        zoom: cy.zoom(),
        pan: { ...cy.pan() },
      }));
      requestAnimationFrame(draw);
      await act(async () =>
        first.resolve({
          id: 'root',
          children: [
            { id: 'a', x: 100, y: 20 },
            { id: 'b', x: 100 + spread, y: 120 },
            { id: 'c', x: 100 + spread * 2, y: 120 },
          ],
        })
      );

      // A separate real Cytoscape core establishes the unchanged fit policy,
      // including the minimum zoom and keeping a distant start node visible.
      const actual = await vi.importActual<{ default: typeof cytoscape }>(
        'cytoscape'
      );
      const reference = actual.default({
        elements: cy
          .elements()
          .map((element) => element.json() as cytoscape.ElementDefinition),
        layout: { name: 'preset' },
        headless: true,
        styleEnabled: true,
        style: [],
        minZoom: 0.01,
        maxZoom: 2.5,
      });
      vi.spyOn(reference, 'width').mockImplementation(() => renderer.width);
      vi.spyOn(reference, 'height').mockImplementation(() => renderer.height);
      reference.fit(reference.elements(), 30);
      if (reference.zoom() < 0.02) {
        reference.zoom({
          level: 0.02,
          renderedPosition: { x: renderer.width / 2, y: renderer.height / 2 },
        });
      }
      ensureStartNodeVisible(reference);
      const expectedViewport = {
        zoom: reference.zoom(),
        pan: { ...reference.pan() },
      };
      reference.destroy();

      await nextFrame();
      expect(draw).toHaveReturnedWith({
        fitCalls: 1,
        nodeCount: 3,
        selected: true,
        highlighted: true,
        ...expectedViewport,
      });
      expect(interactionStateAtFit).toEqual([{ selected: true, highlighted: true }]);
      expect(renderer.fit).toHaveBeenCalledOnce();
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    }
  );

  it('keeps existing elements and positions through a no-op layout', async () => {
    const first = deferredLayout();
    const repeated = deferredLayout();
    renderer.workerLayout
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(repeated.promise);
    render(<Graph />);
    await nextFrame();
    await act(async () => first.resolve(positions(100)));
    await nextFrame();
    const cy = renderer.cores.at(-1)!;
    const node = cy.getElementById('a')[0];
    const before = cy
      .nodes()
      .map((element) => ({ id: element.id(), position: { ...element.position() } }));
    const added = vi.fn();
    const positioned = vi.fn();
    cy.on('add', added);
    cy.on('position', positioned);
    act(() =>
      useGlobalZustand.setState((state) => ({
        machineLoadVersion: state.machineLoadVersion + 1,
      }))
    );
    await nextFrame();
    expect(cy.getElementById('a')[0]).toBe(node);
    expect(
      cy.nodes().map((element) => ({
        id: element.id(),
        position: { ...element.position() },
      }))
    ).toEqual(before);
    await act(async () => repeated.resolve(positions(100)));
    await nextFrame();
    expect(cy.getElementById('a')[0]).toBe(node);
    expect(added).not.toHaveBeenCalled();
    expect(positioned).not.toHaveBeenCalled();
    expect(renderer.fit).toHaveBeenCalledTimes(2);
  });

  it('does not reuse obsolete readiness when topology changes A to B to A', async () => {
    const originalGraph = useGlobalZustand.getState().configGraph;
    const initial = deferredLayout();
    const replaced = deferredLayout();
    const restored = deferredLayout();
    renderer.workerLayout
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(replaced.promise)
      .mockReturnValueOnce(restored.promise);
    render(<Graph />);
    await nextFrame();
    await act(async () => initial.resolve(positions(100)));
    await nextFrame();
    const cy = renderer.cores.at(-1)!;
    const before = cy
      .nodes()
      .map((node) => ({ id: node.id(), position: { ...node.position() } }));
    const changed = vi.fn();
    cy.on('add position', changed);
    act(() =>
      useGlobalZustand.setState({ configGraph: branchingGraph(['d', 'e', 'f']) })
    );
    await nextFrame();
    expect(renderer.workerLayout).toHaveBeenCalledTimes(2);
    expect(
      cy.nodes().map((node) => ({ id: node.id(), position: { ...node.position() } }))
    ).toEqual(before);
    act(() => useGlobalZustand.setState({ configGraph: originalGraph }));
    await nextFrame();
    expect(changed).not.toHaveBeenCalled();
    await act(async () => replaced.resolve(positions(400, ['d', 'e', 'f'])));
    expect(renderer.workerLayout).toHaveBeenCalledTimes(3);
    expect(changed).not.toHaveBeenCalled();
    expect(renderer.fit).toHaveBeenCalledOnce();
    await act(async () => restored.resolve(positions(600)));
    await nextFrame();
    expect(cy.getElementById('b').position('x')).toBe(700);
    expect(renderer.fit).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

  it('keeps readiness hidden when A to B to A completes before the queued restart frame', async () => {
    const originalGraph = useGlobalZustand.getState().configGraph;
    const initial = deferredLayout();
    const restored = deferredLayout();
    renderer.workerLayout
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(restored.promise);
    render(<Graph />);
    await nextFrame();
    await act(async () => initial.resolve(positions(100)));
    await nextFrame();
    const cy = renderer.cores.at(-1)!;
    const before = cy.nodes().map((node) => ({
      id: node.id(),
      position: { ...node.position() },
    }));
    const changed = vi.fn();
    cy.on('add position', changed);

    // React commits both topology revisions, while neither queued layout RAF
    // runs. A's old readiness must not reveal A's newly rebuilt zero positions.
    act(() =>
      useGlobalZustand.setState({
        configGraph: branchingGraph(['d', 'e', 'f']),
        configGraphComputing: true,
      })
    );
    act(() =>
      useGlobalZustand.setState({
        configGraph: originalGraph,
        configGraphComputing: false,
      })
    );
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
    expect(
      cy.nodes().map((node) => ({
        id: node.id(),
        position: { ...node.position() },
      }))
    ).toEqual(before);
    expect(renderer.workerLayout).toHaveBeenCalledOnce();

    await nextFrame();
    expect(renderer.workerLayout).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
    await act(async () => restored.resolve(positions(600)));
    await nextFrame();
    expect(cy.getElementById('b').position('x')).toBe(700);
    expect(renderer.fit).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

  it('keeps a queued A to B to A revision pending when the first A layout finishes before its restart frame', async () => {
    const originalGraph = useGlobalZustand.getState().configGraph;
    const oldLayout = deferredLayout();
    const currentLayout = deferredLayout();
    renderer.workerLayout
      .mockReturnValueOnce(oldLayout.promise)
      .mockReturnValueOnce(currentLayout.promise);
    render(<Graph />);
    await nextFrame();
    act(() =>
      useGlobalZustand.setState({ configGraph: branchingGraph(['d', 'e', 'f']) })
    );
    act(() => useGlobalZustand.setState({ configGraph: originalGraph }));
    await act(async () => oldLayout.resolve(positions(100)));
    expect(renderer.fit).not.toHaveBeenCalled();
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    await nextFrame();
    expect(renderer.workerLayout).toHaveBeenCalledTimes(2);
    await act(async () => currentLayout.resolve(positions(600)));
    await nextFrame();
    expect(renderer.fit).toHaveBeenCalledOnce();
    expect(renderer.fit).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        { id: 'b', position: expect.objectContaining({ x: 700 }) },
      ])
    );
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

  it('does not restart an already completed current resize from an older queued topology request', async () => {
    const originalGraph = useGlobalZustand.getState().configGraph;
    const oldLayout = deferredLayout();
    const resizedLayout = deferredLayout();
    const unexpectedLayout = deferredLayout();
    renderer.workerLayout
      .mockReturnValueOnce(oldLayout.promise)
      .mockReturnValueOnce(resizedLayout.promise)
      .mockReturnValueOnce(unexpectedLayout.promise);
    render(<Graph />);
    await nextFrame();
    act(() =>
      useGlobalZustand.setState({ configGraph: branchingGraph(['d', 'e', 'f']) })
    );
    act(() => useGlobalZustand.setState({ configGraph: originalGraph }));
    act(() => {
      renderer.width = window.innerWidth + 240;
      emitResize();
    });
    await act(async () => oldLayout.resolve(positions(100)));
    expect(renderer.workerLayout).toHaveBeenCalledTimes(2);
    await act(async () => resizedLayout.resolve(positions(600)));
    expect(renderer.fit).toHaveBeenCalledOnce();
    await nextFrame();
    expect(renderer.workerLayout).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    expect(renderer.fit).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        { id: 'b', position: expect.objectContaining({ x: 700 }) },
      ])
    );
  });

  it('reveals a positioned single node without using the layout worker', async () => {
    const graph = branchingGraph();
    graph.Graph = new Map([['a', { ...graph.Graph.get('a')!, next: [] }]]);
    useGlobalZustand.setState({ configGraph: graph });
    render(<Graph />);
    expect(renderer.cores.at(-1)!.nodes()).toHaveLength(0);
    await nextFrame();
    await nextFrame();
    // The synchronous layout path still retains an observable busy turn.
    await nextFrame();
    expect(renderer.workerLayout).not.toHaveBeenCalled();
    expect(renderer.cores.at(-1)!.nodes()).toHaveLength(1);
    expect(renderer.fit).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

  it('inserts and fits recovery positions after a worker failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderer.workerLayout.mockRejectedValue(new Error('layout failed'));
    render(<Graph />);
    expect(renderer.cores.at(-1)!.nodes()).toHaveLength(0);
    await nextFrame();
    await nextFrame();
    const cy = renderer.cores.at(-1)!;
    expect(cy.nodes()).toHaveLength(3);
    expect(renderer.fit).toHaveBeenCalledOnce();
    expect(renderer.fit).toHaveBeenCalledWith(
      cy.nodes().map((node) => ({ id: node.id(), position: { ...node.position() } }))
    );
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

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
      // The resize supersedes the old completion, so only the current layout
      // may fit and reveal the graph.
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
      expect(renderer.fit).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          { id: 'b', position: expect.objectContaining({ x: 500 }) },
        ])
      );
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    }
  );

  it('fits the current single-path layout after resize during its synchronous busy turn', async () => {
    const graph = branchingGraph();
    graph.Graph.get('a')!.next = [['b', 0]];
    graph.Graph.get('b')!.next = [['c', 1]];
    useGlobalZustand.setState({ configGraph: graph });
    render(<Graph />);
    await nextFrame();
    const cy = renderer.cores.at(-1)!;
    expect(renderer.fit).not.toHaveBeenCalled();
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    const initialPositions = cy.nodes().map((node) => ({
      id: node.id(),
      position: { ...node.position() },
    }));

    act(() => {
      renderer.width = 640;
      renderer.height = 1400;
      emitResize();
    });
    await nextFrame();
    await nextFrame();
    const finalPositions = cy.nodes().map((node) => ({
      id: node.id(),
      position: { ...node.position() },
    }));
    expect(finalPositions).not.toEqual(initialPositions);
    expect(renderer.workerLayout).not.toHaveBeenCalled();
    expect(renderer.fit).toHaveBeenCalledOnce();
    expect(renderer.fit).toHaveBeenLastCalledWith(finalPositions);
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

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
    expect(renderer.cores.at(-1)!.nodes()).toHaveLength(3);
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

  it('keeps a same-topology machine reload hidden until its deferred fit on tab return', async () => {
    const initial = deferredLayout();
    const reloaded = deferredLayout();
    renderer.workerLayout
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(reloaded.promise);
    const view = render(<Graph />);
    await nextFrame();
    await act(async () => initial.resolve(positions(100)));
    await nextFrame();
    expect(renderer.fit).toHaveBeenCalledOnce();

    renderer.width = 0;
    renderer.height = 0;
    view.rerender(<Graph active={false} />);
    act(emitResize);
    act(() =>
      useGlobalZustand.setState((state) => ({
        configGraphComputing: true,
        machineLoadVersion: state.machineLoadVersion + 1,
      }))
    );
    await nextFrame();
    expect(renderer.workerLayout).toHaveBeenCalledTimes(2);
    act(() => useGlobalZustand.setState({ configGraphComputing: false }));
    await act(async () => reloaded.resolve(positions(400)));
    await nextFrame();
    expect(renderer.fit).toHaveBeenCalledOnce();
    expect(screen.getByTestId('loader')).toBeInTheDocument();

    renderer.width = window.innerWidth;
    renderer.height = window.innerHeight;
    view.rerender(<Graph />);
    act(emitResize);
    await nextFrame();
    expect(renderer.fit).toHaveBeenCalledTimes(2);
    expect(renderer.fit).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        { id: 'b', position: expect.objectContaining({ x: 500 }) },
      ])
    );
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

  it('ignores a reset machine while repeated tab switches keep the replacement loading', async () => {
    const abandoned = deferredLayout();
    const replacement = deferredLayout();
    renderer.workerLayout
      .mockReturnValueOnce(abandoned.promise)
      .mockReturnValueOnce(replacement.promise);
    const view = render(<Graph selection />);
    await nextFrame();
    const cy = renderer.cores.at(-1)!;
    fireEvent.click(screen.getByRole('button', { name: 'Select before insertion' }));

    for (const active of [false, true, false]) {
      renderer.width = active ? window.innerWidth : 0;
      renderer.height = active ? window.innerHeight : 0;
      view.rerender(<Graph active={active} selection />);
      act(emitResize);
      await nextFrame();
    }
    act(() => {
      useGlobalZustand.getState().reset();
      useGlobalZustand.setState({
        configGraph: branchingGraph(['d', 'e', 'f']),
        machineLoadVersion: 1,
      });
    });
    await nextFrame();
    await act(async () => abandoned.resolve(positions(100)));
    expect(renderer.workerLayout).toHaveBeenCalledTimes(2);
    expect(cy.elements()).toHaveLength(0);
    expect(renderer.fit).not.toHaveBeenCalled();

    await act(async () => replacement.resolve(positions(500, ['d', 'e', 'f'])));
    await nextFrame();
    expect(cy.nodes().map((node) => node.id())).toEqual(['d', 'e', 'f']);
    expect(cy.elements('.ct-selected')).toHaveLength(0);
    expect(renderer.fit).not.toHaveBeenCalled();
    expect(screen.getByTestId('loader')).toBeInTheDocument();

    renderer.width = window.innerWidth;
    renderer.height = window.innerHeight;
    view.rerender(<Graph selection />);
    act(emitResize);
    await nextFrame();
    expect(renderer.workerLayout).toHaveBeenCalledTimes(2);
    expect(renderer.fit).toHaveBeenCalledOnce();
    expect(renderer.fit).toHaveBeenCalledWith(
      cy.nodes().map((node) => ({ id: node.id(), position: { ...node.position() } }))
    );
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

  it('retains a pending first fit while moving through a zero-size fullscreen container', async () => {
    const first = deferredLayout();
    renderer.workerLayout.mockReturnValueOnce(first.promise);
    render(<Graph />);
    await nextFrame();
    act(() => {
      renderer.width = 0;
      renderer.height = 0;
      window.dispatchEvent(
        new CustomEvent(PORTAL_BRIDGE_SWITCH_EVENT, {
          detail: { id: 'configGraph', location: 'target' },
        })
      );
      emitResize();
    });
    await act(async () => first.resolve(positions(300)));
    await nextFrame();
    expect(renderer.fit).not.toHaveBeenCalled();
    expect(screen.getByTestId('loader')).toBeInTheDocument();

    act(() => {
      renderer.width = window.innerWidth + 240;
      renderer.height = window.innerHeight + 160;
      emitResize();
    });
    await nextFrame();
    await nextFrame();
    expect(renderer.workerLayout).toHaveBeenCalledOnce();
    expect(renderer.fit).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

  it('preserves user viewport and selection through same-topology recomputation and tab/fullscreen returns', async () => {
    const first = deferredLayout();
    renderer.workerLayout.mockReturnValueOnce(first.promise);
    const view = render(<Graph selection />);
    await nextFrame();
    await act(async () => first.resolve(positions(100)));
    await nextFrame();
    const cy = renderer.cores.at(-1)!;
    fireEvent.click(screen.getByRole('button', { name: 'Select before insertion' }));
    const viewport = { zoom: 0.37, pan: { x: -140, y: 63 } };
    act(() => {
      cy.viewport(viewport);
    });
    act(() => useGlobalZustand.setState({ configGraphComputing: true }));
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    act(() =>
      useGlobalZustand.setState((state) => ({
        configGraph: branchingGraph(),
        configGraphVersion: state.configGraphVersion + 1,
        configGraphComputing: false,
      }))
    );
    await nextFrame();
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();

    renderer.width = 0;
    renderer.height = 0;
    view.rerender(<Graph active={false} selection />);
    act(emitResize);
    renderer.width = window.innerWidth;
    renderer.height = window.innerHeight;
    view.rerender(<Graph selection />);
    act(emitResize);
    await nextFrame();
    for (const location of ['target', 'fallback']) {
      act(() =>
        window.dispatchEvent(
          new CustomEvent(PORTAL_BRIDGE_SWITCH_EVENT, {
            detail: { id: 'configGraph', location },
          })
        )
      );
      await nextFrame();
    }
    expect(cy.zoom()).toBe(viewport.zoom);
    expect(cy.pan()).toEqual(viewport.pan);
    expect(cy.getElementById('a').hasClass('ct-selected')).toBe(true);
    expect(cy.getElementById('a→b#0').hasClass('ct-highlighted')).toBe(true);
    expect(renderer.workerLayout).toHaveBeenCalledOnce();
    expect(renderer.fit).toHaveBeenCalledOnce();
  });

  it('never inserts or fits a late result after the graph has unmounted', async () => {
    const first = deferredLayout();
    renderer.workerLayout.mockReturnValueOnce(first.promise);
    const view = render(<Graph />);
    await nextFrame();
    const cy = renderer.cores.at(-1)!;
    const added = vi.fn();
    cy.on('add', added);
    view.unmount();
    expect(cy.destroyed()).toBe(true);
    await act(async () => first.resolve(positions(100)));
    await nextFrame();
    expect(added).not.toHaveBeenCalled();
    expect(renderer.fit).not.toHaveBeenCalled();
    expect(renderer.observers.every((observer) => observer.disconnected)).toBe(true);
  });
});
