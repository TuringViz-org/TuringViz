import { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import cytoscape, { type Core } from 'cytoscape';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComputationTreeCircles } from '@components/ComputationTree/ComputationTreeCircles';
import { GraphUIProvider, useGraphUI } from '@components/shared/GraphUIContext';
import { PORTAL_BRIDGE_SWITCH_EVENT } from '@components/MainPage/PortalBridge';
import type { ViewProps } from '@components/ComputationTree/types';
import { End } from '@tmfunctions/ComputationTree';
import { useGlobalZustand } from '@zustands/GlobalZustand';

const renderer = vi.hoisted(() => ({
  instances: [] as Core[],
  running: true,
  completed: 0,
  visible: true,
  resize: () => {},
  restart: vi.fn(),
  onLayout: undefined as
    | undefined
    | ((positions: Map<string, { x: number; y: number }>) => void),
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
      renderer.instances.push(cy);
      return cy;
    },
  };
});
vi.mock('@components/ComputationTree/layout/useElkLayout', () => ({
  useElkLayout: ({ onLayout }: { onLayout: typeof renderer.onLayout }) => {
    renderer.onLayout = onLayout;
    return {
      running: renderer.running,
      completedLayouts: renderer.completed,
      restart: renderer.restart,
    };
  },
}));
vi.mock('@components/ComputationTree/util/cytoscapeStyles', () => ({
  getCyStyles: () => [],
}));
vi.mock('@components/ComputationTree/TreeControls', () => ({
  TreeControls: () => null,
}));
vi.mock('@components/shared/LoadingOverlay', () => ({
  LoadingOverlay: () => <div data-testid="loader" />,
}));
vi.mock('@components/shared/ConfigurationDetailPopper', () => ({
  ConfigurationDetailPopper: ({ open }: { open: boolean }) =>
    open ? <output data-testid="detail" /> : null,
}));

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
function mountGraph() {
  let current = data();
  const element = () => (
    <GraphUIProvider>
      <ComputationTreeCircles
        targetNodes={2}
        active={renderer.visible}
        treeData={current}
      />
    </GraphUIProvider>
  );
  const view = render(element());
  const cy = renderer.instances.at(-1)!;
  const fit = vi.spyOn(cy, 'fit');
  return {
    cy,
    fit,
    update(next = current) {
      current = next;
      view.rerender(element());
    },
    finishLayout() {
      renderer.running = true;
      view.rerender(element());
      act(() => {
        renderer.onLayout?.(new Map([['0', { x: 320, y: 240 }]]));
        renderer.completed += 1;
        renderer.running = false;
      });
      view.rerender(element());
    },
  };
}
async function advance() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  renderer.instances = [];
  renderer.running = true;
  renderer.completed = 0;
  renderer.visible = true;
  renderer.restart.mockReset();
  useGlobalZustand.getState().reset();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() =>
    renderer.visible ? 800 : 0
  );
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() =>
    renderer.visible ? 600 : 0
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        renderer.resize = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('computation tree circle lifecycle', () => {
  it('keeps the loading mask until completed positions have been fitted', async () => {
    const graph = mountGraph();
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    graph.finishLayout();
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(graph.cy.getElementById('0').position()).toEqual({ x: 320, y: 240 });
    await advance();
    expect(graph.fit).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

  it('finishes layout in a hidden tab and waits for visibility before fitting', async () => {
    const graph = mountGraph();
    renderer.visible = false;
    graph.update();
    act(() => renderer.resize());
    graph.finishLayout();
    await advance();
    expect(graph.fit).not.toHaveBeenCalled();
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    renderer.visible = true;
    graph.update();
    act(() => renderer.resize());
    await advance();
    expect(graph.fit).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

  it('preserves pan and zoom on both fullscreen moves without fitting again', async () => {
    const graph = mountGraph();
    graph.finishLayout();
    await advance();
    act(() => graph.cy.viewport({ zoom: 0.7, pan: { x: 130, y: 90 } }));
    const viewport = { zoom: graph.cy.zoom(), pan: { ...graph.cy.pan() } };
    for (const location of ['target', 'source']) {
      act(() =>
        window.dispatchEvent(
          new CustomEvent(PORTAL_BRIDGE_SWITCH_EVENT, {
            detail: { id: 'computationTree', location },
          })
        )
      );
      await advance();
      expect({ zoom: graph.cy.zoom(), pan: graph.cy.pan() }).toEqual(viewport);
    }
    expect(graph.fit).toHaveBeenCalledOnce();
  });

  it('cancels a queued fit when a different topology replaces it', async () => {
    const graph = mountGraph();
    graph.finishLayout();
    renderer.running = true;
    graph.update(data('replacement'));
    await advance();
    expect(graph.fit).not.toHaveBeenCalled();
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    graph.finishLayout();
    await advance();
    expect(graph.fit).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'restores the selection class when entering the node renderer (StrictMode: %s)',
    (strict) => {
      function SwitchRenderer() {
        const { setSelected } = useGraphUI();
        const [show, setShow] = useState(false);
        return show ? (
          <ComputationTreeCircles targetNodes={2} treeData={data()} />
        ) : (
          <button
            onClick={() => {
              setSelected({ type: 'node', id: '0' });
              setShow(true);
            }}
          >
            Show node view
          </button>
        );
      }
      const content = (
        <GraphUIProvider>
          <SwitchRenderer />
        </GraphUIProvider>
      );
      render(strict ? <StrictMode>{content}</StrictMode> : content);
      fireEvent.click(screen.getByRole('button', { name: 'Show node view' }));
      expect(
        renderer.instances.at(-1)!.getElementById('0').hasClass('ct-selected')
      ).toBe(true);
    }
  );

  it('preserves selection and hover while reconciling updated node data', async () => {
    const graph = mountGraph();
    graph.finishLayout();
    await advance();
    act(() => {
      graph.cy.getElementById('0').emit('tap');
      graph.cy.getElementById('0').emit('mouseover');
    });
    const next = data();
    next.base.nodes[0].data.isComputed = false;
    graph.update(next);
    const node = graph.cy.getElementById('0');
    expect(node.hasClass('pending')).toBe(true);
    expect(node.hasClass('ct-selected')).toBe(true);
    expect(node.hasClass('hovered')).toBe(true);
    act(() => node.emit('mouseout'));
    expect(node.hasClass('ct-selected')).toBe(true);
    expect(node.hasClass('hovered')).toBe(false);
  });

  it('retains the same Cytoscape instance when selection, hover and visibility change', async () => {
    const graph = mountGraph();
    graph.finishLayout();
    await advance();
    act(() => graph.cy.getElementById('0').emit('tap'));
    expect(screen.getByTestId('detail')).toBeInTheDocument();
    act(() => graph.cy.getElementById('0').emit('mouseover'));
    renderer.visible = false;
    graph.update();
    act(() => renderer.resize());
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
    renderer.visible = true;
    graph.update();
    act(() => renderer.resize());
    expect(screen.getByTestId('detail')).toBeInTheDocument();
    expect(renderer.instances).toEqual([graph.cy]);
    expect(graph.cy.destroyed()).toBe(false);
  });
});
