import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CSSProperties, PropsWithChildren } from 'react';
import { ComputationTreeCards } from '@components/ComputationTree/ComputationTreeCards';
import {
  PORTAL_BRIDGE_BEFORE_SWITCH_EVENT,
  PORTAL_BRIDGE_SWITCH_EVENT,
} from '@components/MainPage/PortalBridge';
import { End } from '@tmfunctions/ComputationTree';
import type { ViewProps } from '@components/ComputationTree/types';

const renderer = vi.hoisted(() => ({
  width: 800,
  domVisible: true,
  height: 600,
  nodesReady: true,
  running: false,
  completedLayouts: 0,
  restart: vi.fn(),
  onLayout: null as
    | null
    | ((positions: Map<string, { x: number; y: number }>) => void),
  fitView: vi.fn(),
  setViewport: vi.fn(),
  getViewport: vi.fn(),
  getNodes: vi.fn(),
}));
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  const flow = {
    fitView: renderer.fitView,
    setViewport: renderer.setViewport,
    getViewport: renderer.getViewport,
    getNodes: renderer.getNodes,
  };
  return {
    ...actual,
    ReactFlow: ({
      style,
      children,
    }: PropsWithChildren<{ style: CSSProperties }>) => (
      <div data-testid="graph" style={style}>
        {children}
      </div>
    ),
    Background: () => null,
    useReactFlow: () => flow,
    useNodesInitialized: () => renderer.nodesReady,
    useStore: (selector: (state: { width: number; height: number }) => unknown) =>
      selector(renderer),
  };
});
vi.mock('@components/ComputationTree/layout/useElkLayout', () => ({
  useElkLayout: ({ onLayout }: { onLayout: typeof renderer.onLayout }) => {
    renderer.onLayout = onLayout;
    return {
      running: renderer.running,
      completedLayouts: renderer.completedLayouts,
      restart: renderer.restart,
    };
  },
}));
vi.mock('@components/ComputationTree/TreeControls', () => ({
  TreeControls: () => null,
}));
vi.mock('@components/shared/LoadingOverlay', () => ({
  LoadingOverlay: () => <div data-testid="loader" />,
}));
vi.mock('@components/shared/GraphUIContext', () => {
  const setSelected = vi.fn();
  return { useGraphUI: () => ({ setSelected }) };
});
vi.mock('@components/ConfigGraph/nodes/ConfigNode', () => ({
  ConfigNode: () => null,
}));
vi.mock('@components/ConfigGraph/nodes/ConfigCardNode', () => ({
  ConfigCardNode: () => null,
}));
vi.mock('@components/ConfigGraph/edges/FloatingEdge', () => ({
  FloatingEdge: () => null,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function data(topology = 'first'): ViewProps['treeData'] {
  const config = { state: 'q0', tapes: [[[], []]] as [[], []][], heads: [0] };
  const root = { id: 0, config, end: End.None };
  return {
    model: { root, nodes: [root], edges: [] },
    base: {
      nodes: [
        {
          id: '0',
          position: { x: 100, y: 100 },
          width: 80,
          height: 80,
          data: { config, label: 'q0', isStart: true, isCurrent: false },
        },
      ],
      edges: [],
      topoKey: topology,
    },
    isComputing: false,
  };
}

async function advance(ms = 32) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function mountGraph(treeData = data()) {
  let current = treeData;
  let active = true;
  const element = () => (
    <ComputationTreeCards targetNodes={2} active={active} treeData={current} />
  );
  const view = render(element());
  return {
    ...view,
    update: (next = current, nextActive = active) => {
      current = next;
      active = nextActive;
      view.rerender(element());
    },
    finishLayout: () => {
      renderer.running = true;
      view.rerender(element());
      act(() => {
        renderer.onLayout?.(new Map([['0', { x: 100, y: 100 }]]));
        renderer.completedLayouts += 1;
        renderer.running = false;
      });
      view.rerender(element());
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  renderer.width = 800;
  renderer.height = 600;
  renderer.domVisible = true;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() =>
    renderer.domVisible ? renderer.width : 0
  );
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() =>
    renderer.domVisible ? renderer.height : 0
  );
  renderer.nodesReady = true;
  renderer.running = false;
  renderer.completedLayouts = 0;
  renderer.restart.mockReset();
  renderer.fitView.mockReset().mockResolvedValue(true);
  renderer.setViewport.mockReset().mockResolvedValue(true);
  renderer.getViewport.mockReset().mockReturnValue({ x: 0, y: 0, zoom: 1 });
  renderer.getNodes.mockReset().mockReturnValue(data().base.nodes);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('computation tree presentation', () => {
  it('preserves the renderer fit viewport and keeps cards hidden until the fit settles', async () => {
    const fit = deferred<boolean>();
    renderer.fitView.mockReturnValue(fit.promise);
    renderer.getNodes.mockReturnValue([
      { ...data().base.nodes[0], position: { x: -1000, y: 0 } },
    ]);
    const view = mountGraph();
    view.finishLayout();
    await advance();
    expect(renderer.fitView).toHaveBeenCalledOnce();
    expect(view.getByTestId('graph')).toHaveStyle({ opacity: '0' });
    const fittedViewport = { x: -77.475, y: 263.675, zoom: 0.05 };
    renderer.getViewport.mockReturnValue(fittedViewport);
    await act(async () => {
      fit.resolve(true);
    });
    expect(renderer.setViewport).not.toHaveBeenCalled();
    await advance(122);
    expect(view.queryByTestId('loader')).toBeNull();
    expect(view.getByTestId('graph')).toHaveStyle({ opacity: '1' });

    act(() => {
      const detail = { id: 'computationTree', location: 'target' };
      window.dispatchEvent(new CustomEvent(PORTAL_BRIDGE_SWITCH_EVENT, { detail }));
    });
    await advance();
    expect(renderer.setViewport).toHaveBeenCalledExactlyOnceWith(fittedViewport, {
      duration: 0,
    });
  });

  it('does not consume the pending fit when a hidden layout times out without a result', async () => {
    const view = mountGraph();
    renderer.running = true;
    view.update();
    await advance();
    renderer.running = false;
    view.update();
    await advance(200);
    expect(renderer.fitView).not.toHaveBeenCalled();
    expect(view.queryByTestId('loader')).not.toBeNull();
    view.finishLayout();
    await advance();
    await advance(122);
    expect(renderer.fitView).toHaveBeenCalledOnce();
    expect(view.queryByTestId('loader')).toBeNull();
  });

  it('never reveals a replacement topology using the preceding fit completion', async () => {
    const fit = deferred<boolean>();
    renderer.fitView.mockReturnValueOnce(fit.promise);
    const view = mountGraph();
    view.finishLayout();
    await advance();
    view.update(data('replacement'));
    await act(async () => {
      fit.resolve(true);
    });
    await advance(300);
    expect(view.queryByTestId('loader')).not.toBeNull();
    expect(view.getByTestId('graph')).toHaveStyle({ opacity: '0' });
    view.finishLayout();
    await advance();
    await advance(122);
    expect(view.queryByTestId('loader')).toBeNull();
  });

  it('finishes a hidden layout even when React Flow retains its previous dimensions', async () => {
    const view = mountGraph();
    renderer.domVisible = false;
    view.update(undefined, false);
    view.finishLayout();
    await advance();
    expect(renderer.fitView).not.toHaveBeenCalled();
    const layoutRequests = renderer.restart.mock.calls.length;
    renderer.domVisible = true;
    view.update(undefined, true);
    await advance();
    await advance(122);
    expect(renderer.restart).toHaveBeenCalledTimes(layoutRequests);
    expect(renderer.fitView).toHaveBeenCalledOnce();
    expect(view.queryByTestId('loader')).toBeNull();
  });

  it('retries a completed layout fit when card measurements become ready again', async () => {
    const view = mountGraph();
    view.finishLayout();
    renderer.nodesReady = false;
    view.update();
    await advance();
    expect(renderer.fitView).not.toHaveBeenCalled();
    expect(view.queryByTestId('loader')).not.toBeNull();

    renderer.nodesReady = true;
    view.update();
    await advance();
    await advance(122);
    expect(renderer.fitView).toHaveBeenCalledOnce();
    expect(view.queryByTestId('loader')).toBeNull();
  });

  it('invalidates an awaited fit before the portal moves to its next destination', async () => {
    const pendingFit = deferred<boolean>();
    renderer.fitView.mockReturnValueOnce(pendingFit.promise);
    const view = mountGraph();
    view.finishLayout();
    await advance();
    const detail = { id: 'computationTree', location: 'target' };
    act(() => {
      window.dispatchEvent(
        new CustomEvent(PORTAL_BRIDGE_BEFORE_SWITCH_EVENT, { detail })
      );
    });
    await act(async () => pendingFit.resolve(true));
    await advance(122);
    expect(view.queryByTestId('loader')).not.toBeNull();
    expect(view.getByTestId('graph')).toHaveStyle({ opacity: '0' });

    act(() => {
      window.dispatchEvent(new CustomEvent(PORTAL_BRIDGE_SWITCH_EVENT, { detail }));
    });
    await advance();
    await advance(122);
    expect(renderer.fitView).toHaveBeenCalledTimes(2);
    expect(view.queryByTestId('loader')).toBeNull();
  });

  it('restores the saved viewport across fullscreen and keeps the mask until it settles', async () => {
    const view = mountGraph();
    view.finishLayout();
    await advance();
    await advance(122);
    expect(view.queryByTestId('loader')).toBeNull();
    const restore = deferred<boolean>();
    renderer.setViewport.mockReturnValue(restore.promise);
    act(() => {
      const detail = { id: 'computationTree', location: 'target' };
      window.dispatchEvent(
        new CustomEvent(PORTAL_BRIDGE_BEFORE_SWITCH_EVENT, { detail })
      );
      window.dispatchEvent(new CustomEvent(PORTAL_BRIDGE_SWITCH_EVENT, { detail }));
    });
    expect(view.getByTestId('graph')).toHaveStyle({ opacity: '0' });
    await advance();
    expect(renderer.fitView).toHaveBeenCalledOnce();
    expect(renderer.setViewport).toHaveBeenLastCalledWith(
      { x: 0, y: 0, zoom: 1 },
      { duration: 0 }
    );
    await advance(200);
    expect(view.queryByTestId('loader')).not.toBeNull();
    await act(async () => {
      restore.resolve(true);
    });
    await advance(122);
    expect(view.queryByTestId('loader')).toBeNull();
  });
  it('keeps the settled viewport when background recomputation returns the same topology', async () => {
    const treeData = data();
    const view = mountGraph(treeData);
    view.finishLayout();
    await advance();
    await advance(122);
    const layoutRequests = renderer.restart.mock.calls.length;
    expect(view.queryByTestId('loader')).toBeNull();

    view.update({ ...treeData, isComputing: true }, false);
    expect(view.getByTestId('graph')).toHaveStyle({ opacity: '0' });
    view.update(treeData, false);
    await advance(200);
    view.update(treeData, true);
    await advance();
    await advance(122);
    expect(view.queryByTestId('loader')).toBeNull();
    expect(renderer.fitView).toHaveBeenCalledOnce();
    expect(renderer.restart).toHaveBeenCalledTimes(layoutRequests);
    expect(renderer.setViewport).toHaveBeenCalledOnce();
  });
});
