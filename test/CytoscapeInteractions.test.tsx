import { useCallback, useEffect, useRef, useState } from 'react';
import cytoscape, { type Core } from 'cytoscape';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  type RenderResult,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphUIProvider, useGraphUI } from '@components/shared/GraphUIContext';
import { useCytoscapeGraphInteractions } from '@components/shared/useCytoscapeGraphInteractions';
import { ConfigGraphCircles } from '@components/ConfigGraph/ConfigGraphCircles';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { HOVER_POPPER_DELAY_MS } from '@utils/constants';

const instances = vi.hoisted(() => ({ current: null as Core | null }));
vi.mock('cytoscape', async (original) => {
  const actual = await original<{ default: typeof cytoscape }>();
  return {
    default: (options: cytoscape.CytoscapeOptions) => {
      instances.current = actual.default({
        ...options,
        container: undefined,
        headless: true,
        styleEnabled: true,
      });
      return instances.current;
    },
  };
});
vi.mock('@components/ConfigGraph/layout/useElkLayout', () => ({
  useElkLayout: ({
    nodes,
    onLayout,
  }: {
    nodes: Array<{ id: string; position: { x: number; y: number } }>;
    onLayout: (positions: Map<string, { x: number; y: number }>) => void;
  }) => {
    const [completedLayouts, setCompletedLayouts] = useState(0);
    const inputRef = useRef({ nodes, onLayout });
    inputRef.current = { nodes, onLayout };
    const restart = useCallback(() => {
      const current = inputRef.current;
      current.onLayout(
        new Map(current.nodes.map((node) => [node.id, node.position]))
      );
      setCompletedLayouts((count) => count + 1);
    }, []);
    return { running: false, completedLayouts, restart };
  },
}));
vi.mock('@components/ConfigGraph/util/buildConfigGraph', () => ({
  buildConfigGraph: () => ({ nodes, edges, topoKey: 'abc' }),
}));
vi.mock('@hooks/useCurrentConfigHighlight', () => ({
  useCurrentConfigHighlight: (structure: unknown) => structure,
  configurationHashFromNodeId: (node: { id: string }) => node.id,
}));
vi.mock('@components/ConfigGraph/ConfigGraphControls', () => ({
  ConfigGraphControls: () => null,
}));
vi.mock('@components/ConfigGraph/rendering/styles', () => ({
  getConfigGraphStyles: () => [],
}));
vi.mock('@components/ConfigGraph/ConfigVisualization/ConfigCard', () => ({
  default: ({ config }: { config: { state: string } }) => (
    <output data-testid="node-detail">{config.state}</output>
  ),
}));

vi.mock('@components/shared/ConfigurationDetailPopper', () => ({
  makeVirtualAnchor: (anchor: unknown) => anchor,
  ConfigurationDetailPopper: ({
    open,
    config,
  }: {
    open: boolean;
    config?: { state: string };
  }) =>
    open && config ? (
      <output data-testid="node-detail">{config.state}</output>
    ) : null,
}));
vi.mock('@components/ConfigGraph/edges/EdgeTooltip', () => ({
  EdgeTooltip: ({ open, sourceLabel }: { open: boolean; sourceLabel: string }) =>
    open ? <output data-testid="edge-detail">{sourceLabel}</output> : null,
}));

const nodes = ['a', 'b', 'c'].map((id, index) => ({
  id,
  position: { x: index * 100, y: 100 },
  data: { label: id, config: { state: id, tapes: [], heads: [] } },
}));
const edges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
];

function Selection() {
  const { selected, setSelected } = useGraphUI();
  return (
    <>
      <output data-testid="selection">{selected.id}</output>
      <button onClick={() => setSelected({ type: null, id: null })}>Clear</button>
    </>
  );
}

function TreeInteractions({ cy, visible }: { cy: Core; visible: boolean }) {
  const cyRef = useRef(cy);
  const containerRef = useRef<HTMLDivElement>(null);
  const { bindEvents, popovers } = useCytoscapeGraphInteractions({
    cyRef,
    containerRef,
    containerVisible: visible,
    pendingInteractive: false,
    nodes,
    edges,
  });
  useEffect(() => bindEvents(cy), [bindEvents, cy]);
  return <div ref={containerRef}>{popovers}</div>;
}

describe.each(['computation tree', 'configuration graph'] as const)(
  '%s Cytoscape selection and hover interactions',
  (graph) => {
    let cy: Core;
    let visible: boolean;
    let view: RenderResult;
    let resize: () => void;

    function content() {
      return (
        <GraphUIProvider>
          {graph === 'computation tree' ? (
            <TreeInteractions cy={cy} visible={visible} />
          ) : (
            <ConfigGraphCircles active={visible} />
          )}
          <Selection />
        </GraphUIProvider>
      );
    }

    beforeEach(() => {
      vi.useFakeTimers();
      visible = true;
      resize = () => {};
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            resize = callback;
          }
          observe() {}
          disconnect() {}
        }
      );
      useGlobalZustand.getState().reset();
      useGlobalZustand.setState({ configGraph: { Graph: new Map() } as never });
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() =>
        visible ? 800 : 0
      );
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
        () => (visible ? 600 : 0)
      );
      if (graph === 'computation tree')
        cy = cytoscape({
          headless: true,
          elements: [
            ...nodes.map(({ id }) => ({ data: { id } })),
            ...edges.map((edge) => ({ data: edge })),
          ],
        });
      view = render(content());
      act(() => vi.advanceTimersByTime(20));
      cy = instances.current!;
    });
    afterEach(() => {
      cleanup();
      cy.destroy();
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    function emit(id: string, type: string) {
      cy.getElementById(id).emit(type);
    }

    function hoverAndLeave(id: string) {
      act(() => emit(id, 'mouseover'));
      act(() => vi.advanceTimersByTime(HOVER_POPPER_DELAY_MS));
      act(() => emit(id, 'mouseout'));
    }

    it.each(['a', 'b', 'ab'])(
      'keeps the selected node details when hovering and leaving %s',
      (hoverId) => {
        act(() => emit('a', 'tap'));
        hoverAndLeave(hoverId);
        expect(screen.getByTestId('selection')).toHaveTextContent('a');
        expect(screen.getByTestId('node-detail')).toHaveTextContent('a');
        expect(screen.queryByTestId('edge-detail')).not.toBeInTheDocument();
      }
    );

    it.each(['ab', 'bc', 'b'])(
      'keeps the selected edge details when hovering and leaving %s',
      (hoverId) => {
        act(() => emit('ab', 'tap'));
        hoverAndLeave(hoverId);
        expect(screen.getByTestId('selection')).toHaveTextContent('ab');
        expect(screen.getByTestId('edge-detail')).toHaveTextContent('a');
        expect(screen.queryByTestId('node-detail')).not.toBeInTheDocument();
      }
    );

    it('preserves a selection made before a pending node hover opens', () => {
      act(() => {
        emit('b', 'mouseover');
        emit('ab', 'tap');
        emit('c', 'mouseover');
        vi.advanceTimersByTime(HOVER_POPPER_DELAY_MS);
      });
      expect(screen.getByTestId('edge-detail')).toHaveTextContent('a');
      expect(screen.queryByTestId('node-detail')).not.toBeInTheDocument();
    });

    it('does not lose a selection when mouseout follows the tap in the same event batch', () => {
      act(() => emit('a', 'mouseover'));
      act(() => vi.advanceTimersByTime(HOVER_POPPER_DELAY_MS));
      act(() => {
        emit('a', 'tap');
        emit('a', 'mouseout');
      });
      expect(screen.getByTestId('node-detail')).toHaveTextContent('a');
    });

    it('shows only the newly selected kind when switching between nodes and edges', () => {
      act(() => emit('a', 'tap'));
      act(() => emit('ab', 'tap'));
      expect(screen.queryByTestId('node-detail')).not.toBeInTheDocument();
      expect(screen.getByTestId('edge-detail')).toHaveTextContent('a');
      act(() => emit('b', 'tap'));
      expect(screen.getByTestId('node-detail')).toHaveTextContent('b');
      expect(screen.queryByTestId('edge-detail')).not.toBeInTheDocument();
    });

    it('still shows hover details without a selection and closes them on mouseout', () => {
      act(() => emit('a', 'mouseover'));
      act(() => vi.advanceTimersByTime(HOVER_POPPER_DELAY_MS));
      expect(screen.getByTestId('node-detail')).toHaveTextContent('a');
      act(() => emit('a', 'mouseout'));
      expect(screen.queryByTestId('node-detail')).not.toBeInTheDocument();
      act(() => emit('ab', 'mouseover'));
      expect(screen.getByTestId('edge-detail')).toHaveTextContent('a');
      act(() => emit('ab', 'mouseout'));
      expect(screen.queryByTestId('edge-detail')).not.toBeInTheDocument();
    });

    it('closes selected details on a background tap', () => {
      act(() => emit('a', 'tap'));
      act(() => cy.emit('tap'));
      expect(screen.getByTestId('selection')).toBeEmptyDOMElement();
      expect(screen.queryByTestId('node-detail')).not.toBeInTheDocument();
    });

    it('closes details after an external deselection', () => {
      act(() => emit('a', 'tap'));
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      expect(screen.queryByTestId('node-detail')).not.toBeInTheDocument();
    });

    it.each([
      { state: 'pending', completed: false },
      { state: 'completed', completed: true },
    ])('discards a $state hover when hidden', ({ completed }) => {
      act(() => emit('a', 'mouseover'));
      if (completed) act(() => vi.advanceTimersByTime(HOVER_POPPER_DELAY_MS));
      visible = false;
      view.rerender(content());
      act(() => resize());
      act(() => vi.advanceTimersByTime(HOVER_POPPER_DELAY_MS));
      visible = true;
      view.rerender(content());
      act(() => resize());
      expect(screen.queryByTestId('node-detail')).not.toBeInTheDocument();
    });
  }
);
