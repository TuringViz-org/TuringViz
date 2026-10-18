import { useState, type ReactNode, type CSSProperties } from 'react';
import type { Node, Viewport } from '@xyflow/react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigGraphWrapper } from '@components/ConfigGraph/ConfigGraph';
import { ConfigNodeMode } from '@utils/constants';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { useGraphZustand } from '@zustands/GraphZustand';
import {
  PORTAL_BRIDGE_BEFORE_SWITCH_EVENT,
  PORTAL_BRIDGE_SWITCH_EVENT,
} from '@components/MainPage/PortalBridge';

const state = vi.hoisted(() => ({
  running: false,
  completed: 0,
  width: 800,
  height: 600,
  nodesReady: true,
  fit: vi.fn(),
  restore: vi.fn(),
  restart: vi.fn(),
  onMoveEnd: undefined as
    | undefined
    | ((_event: unknown, viewport: Viewport) => void),
}));

vi.mock('@xyflow/react', async (original) => {
  const actual = await original<typeof import('@xyflow/react')>();
  return {
    ...actual,
    ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
    ReactFlow: ({
      style,
      onMoveEnd,
    }: {
      style: CSSProperties;
      onMoveEnd: typeof state.onMoveEnd;
    }) => {
      state.onMoveEnd = onMoveEnd;
      return <div data-testid="graph" style={style} />;
    },
    useNodesInitialized: () => state.nodesReady,
    useNodesState: (initial: unknown[]) => [...useState(initial), () => {}],
    useEdgesState: (initial: unknown[]) => [...useState(initial), () => {}],
    useStore: (select: (s: { width: number; height: number }) => unknown) =>
      select({ width: state.width, height: state.height }),
    useReactFlow: () => flow,
  };
});
const flow = {
  fitView: state.fit,
  setViewport: state.restore,
  getViewport: () => ({ x: 100, y: 100, zoom: 1 }),
  getNodes: (): Node[] => [],
};
vi.mock('@components/ConfigGraph/layout/useElkLayout', () => ({
  useElkLayout: () => ({
    running: state.running,
    completedLayouts: state.completed,
    restart: state.restart,
  }),
}));
vi.mock('@components/ConfigGraph/ConfigGraphControls', () => ({
  ConfigGraphControls: () => null,
}));
vi.mock('@components/ConfigGraph/ConfigGraphCircles', () => ({
  ConfigGraphCircles: () => null,
}));
vi.mock('@components/ConfigGraph/util/buildConfigGraph', () => ({
  buildConfigGraph: () => ({
    nodes: [{ id: 'q0', position: { x: 0, y: 0 }, data: { isStart: true } }],
    edges: [],
    topoKey: 'q0',
  }),
}));

async function settleFrames() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
}
function finishLayout() {
  state.running = false;
  state.completed += 1;
}

describe('configuration card viewport lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGlobalZustand.getState().reset();
    useGlobalZustand.setState({ configGraph: { Graph: new Map() } as never });
    useGraphZustand.getState().setConfigGraphNodeMode(ConfigNodeMode.CARDS);
    state.width = 800;
    state.height = 600;
    state.nodesReady = true;
    state.running = true;
    state.completed = 0;
    state.fit.mockReset().mockResolvedValue(true);
    state.restore.mockReset().mockResolvedValue(true);
    state.restart.mockClear();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
      () => state.width
    );
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
      () => state.height
    );
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the graph hidden until fitView resolves and the renderer settles', async () => {
    let completeFit!: (fitted: boolean) => void;
    state.fit.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          completeFit = resolve;
        })
    );
    const view = render(<ConfigGraphWrapper />);
    finishLayout();
    view.rerender(<ConfigGraphWrapper />);
    await settleFrames();
    expect(state.fit).toHaveBeenCalled();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '0' });
    await act(async () => completeFit(true));
    await settleFrames();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });
  });

  it('preserves the renderer fit viewport without repositioning an offscreen start node', async () => {
    const getViewport = vi.spyOn(flow, 'getViewport');
    vi.spyOn(flow, 'getNodes').mockReturnValue([
      {
        id: 'q0',
        data: { isStart: true },
        position: { x: -10000, y: 0 },
        width: 80,
        height: 80,
      },
    ]);
    const view = render(<ConfigGraphWrapper />);
    const fittedViewport = { x: -77.475, y: 263.675, zoom: 0.05 };
    getViewport.mockReturnValue(fittedViewport);
    finishLayout();
    view.rerender(<ConfigGraphWrapper />);
    await settleFrames();
    await settleFrames();
    expect(state.restore).not.toHaveBeenCalled();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(PORTAL_BRIDGE_SWITCH_EVENT, {
          detail: { id: 'configGraph', location: 'target' },
        })
      );
    });
    await settleFrames();
    expect(state.restore).toHaveBeenCalledExactlyOnceWith(fittedViewport, {
      duration: 0,
    });
  });

  it('finishes layout while hidden and performs its fit only after returning', async () => {
    const view = render(<ConfigGraphWrapper />);
    state.width = 0;
    state.height = 0;
    view.rerender(<ConfigGraphWrapper active={false} />);
    finishLayout();
    view.rerender(<ConfigGraphWrapper active={false} />);
    await settleFrames();
    expect(state.fit).not.toHaveBeenCalled();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '0' });
    state.width = 800;
    state.height = 600;
    view.rerender(<ConfigGraphWrapper />);
    await settleFrames();
    await settleFrames();
    expect(state.fit).toHaveBeenCalledOnce();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });
  });

  it('never reveals from a pending fit after a new layout starts', async () => {
    let completeFit!: (fitted: boolean) => void;
    state.fit.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          completeFit = resolve;
        })
    );
    const view = render(<ConfigGraphWrapper />);
    finishLayout();
    view.rerender(<ConfigGraphWrapper />);
    await settleFrames();
    state.running = true;
    view.rerender(<ConfigGraphWrapper />);
    await act(async () => completeFit(true));
    await settleFrames();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '0' });
    expect(state.restore).not.toHaveBeenCalled();
  });

  it('retries a completed layout fit after card measurements become ready again', async () => {
    state.fit.mockImplementation(async () => state.nodesReady);
    const view = render(<ConfigGraphWrapper />);
    finishLayout();
    view.rerender(<ConfigGraphWrapper />);
    // Measurements can be invalidated between the layout commit and its queued fit.
    state.nodesReady = false;
    view.rerender(<ConfigGraphWrapper />);
    await settleFrames();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '0' });

    state.nodesReady = true;
    view.rerender(<ConfigGraphWrapper />);
    await settleFrames();
    await settleFrames();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });
    expect(state.fit).toHaveBeenCalledOnce();
  });

  it.each(['fit', 'restore'] as const)(
    'ignores a superseded %s rejection when restoring the viewport on tab return',
    async (operation) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      let rejectOperation!: (error: Error) => void;
      const pending = new Promise<boolean>((_resolve, reject) => {
        rejectOperation = reject;
      });
      if (operation === 'fit') state.fit.mockReturnValueOnce(pending);
      const view = render(<ConfigGraphWrapper />);
      finishLayout();
      view.rerender(<ConfigGraphWrapper />);
      await settleFrames();
      await settleFrames();

      const switchPortal = () => {
        act(() => {
          const detail = { id: 'configGraph', location: 'target' };
          window.dispatchEvent(
            new CustomEvent(PORTAL_BRIDGE_BEFORE_SWITCH_EVENT, { detail })
          );
          window.dispatchEvent(
            new CustomEvent(PORTAL_BRIDGE_SWITCH_EVENT, { detail })
          );
        });
      };
      if (operation === 'restore') {
        state.restore.mockReturnValueOnce(pending);
        switchPortal();
        await settleFrames();
      }

      switchPortal();
      await settleFrames();
      await settleFrames();
      expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });
      await act(async () => rejectOperation(new Error('Superseded viewport')));

      const fitsBeforeReturn = state.fit.mock.calls.length;
      view.rerender(<ConfigGraphWrapper active={false} />);
      view.rerender(<ConfigGraphWrapper />);
      await settleFrames();
      await settleFrames();
      expect(state.fit).toHaveBeenCalledTimes(fitsBeforeReturn);
      expect(state.restore).toHaveBeenLastCalledWith(
        { x: 100, y: 100, zoom: 1 },
        { duration: 0 }
      );
      expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });
      expect(warn).not.toHaveBeenCalled();
    }
  );

  it('does not consume a pending fit when a hidden-document layout aborts without positions', async () => {
    const view = render(<ConfigGraphWrapper />);
    state.running = false; // timeout or stale request: no successful completion
    view.rerender(<ConfigGraphWrapper />);
    await settleFrames();
    expect(state.fit).not.toHaveBeenCalled();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '0' });
    state.running = true;
    view.rerender(<ConfigGraphWrapper />);
    finishLayout();
    view.rerender(<ConfigGraphWrapper />);
    await settleFrames();
    await settleFrames();
    expect(state.fit).toHaveBeenCalledOnce();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });
  });

  it('keeps the settled viewport when recomputation returns the same topology', async () => {
    const view = render(<ConfigGraphWrapper />);
    finishLayout();
    view.rerender(<ConfigGraphWrapper />);
    await settleFrames();
    await settleFrames();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });
    act(() => useGlobalZustand.setState({ configGraphComputing: true }));
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '0' });
    act(() => useGlobalZustand.setState({ configGraphComputing: false }));
    await settleFrames();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });
    expect(state.fit).toHaveBeenCalledOnce();
  });
  it('restores the last user pan and zoom after a fullscreen round trip', async () => {
    const view = render(<ConfigGraphWrapper />);
    finishLayout();
    view.rerender(<ConfigGraphWrapper />);
    await settleFrames();
    await settleFrames();
    const movedViewport = { x: -240, y: 89, zoom: 0.34 };
    act(() => state.onMoveEnd?.(null, movedViewport));

    for (const location of ['target', 'home']) {
      act(() => {
        const detail = { id: 'configGraph', location };
        window.dispatchEvent(
          new CustomEvent(PORTAL_BRIDGE_BEFORE_SWITCH_EVENT, { detail })
        );
        window.dispatchEvent(
          new CustomEvent(PORTAL_BRIDGE_SWITCH_EVENT, { detail })
        );
      });
      expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '0' });
      await settleFrames();
      await settleFrames();
      expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });
    }
    expect(state.fit).toHaveBeenCalledOnce();
    expect(state.restore).toHaveBeenCalledTimes(2);
    for (const [viewport, options] of state.restore.mock.calls) {
      expect(viewport).toEqual(movedViewport);
      expect(options).toEqual({ duration: 0 });
    }
  });

  it('does not cancel a pending fit when another graph switches its portal', async () => {
    let completeFit!: (fitted: boolean) => void;
    state.fit.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          completeFit = resolve;
        })
    );
    const view = render(<ConfigGraphWrapper />);
    finishLayout();
    view.rerender(<ConfigGraphWrapper />);
    await settleFrames();
    act(() => {
      const detail = { id: 'computationTree', location: 'target' };
      window.dispatchEvent(
        new CustomEvent(PORTAL_BRIDGE_BEFORE_SWITCH_EVENT, { detail })
      );
      window.dispatchEvent(new CustomEvent(PORTAL_BRIDGE_SWITCH_EVENT, { detail }));
    });
    await act(async () => completeFit(true));
    await settleFrames();
    expect(state.fit).toHaveBeenCalledOnce();
    expect(state.restore).not.toHaveBeenCalled();
    expect(screen.getByTestId('graph')).toHaveStyle({ opacity: '1' });
  });
});
