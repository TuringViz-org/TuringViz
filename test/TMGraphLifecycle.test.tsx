import { StrictMode, useRef } from 'react';
import cytoscape, { type Core } from 'cytoscape';
import { ThemeProvider } from '@mui/material/styles';
import { act, cleanup, render, screen } from '@testing-library/react';
import { theme } from '@theme';
import { TMGraphWrapper } from '@components/TMGraph/TMGraph';
import { PortalBridge } from '@components/MainPage/PortalBridge';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { Move } from '@mytypes/TMTypes';

type ObserverRecord = {
  callback: () => void;
  core: Core | null;
  observed: Element | null;
  disconnected: boolean;
};
const state = vi.hoisted(() => ({
  running: true,
  completed: 0,
  width: 800,
  height: 600,
  cores: [] as Core[],
  observers: [] as ObserverRecord[],
  fit: vi.fn(),
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
      state.cores.push(cy);
      vi.spyOn(cy, 'fit').mockImplementation(() => {
        state.fit();
        cy.zoom(0.7);
        cy.pan({ x: 100, y: 50 });
        return cy;
      });
      return cy;
    },
  };
});
vi.mock('@components/ComputationTree/layout/useElkLayout', () => ({
  useElkLayout: ({ onLayout }: { onLayout: typeof state.onLayout }) => {
    state.onLayout = onLayout;
    return {
      running: state.running,
      completedLayouts: state.completed,
      restart: state.restart,
    };
  },
}));
vi.mock('@components/TMGraph/rendering/styles', () => ({
  getTMGraphStyles: () => [],
}));
vi.mock('@components/TMGraph/TMGraphControls', () => ({
  TMGraphControls: () => null,
}));
vi.mock('@components/TMGraph/edges/EdgeTooltip', () => ({
  EdgeTooltip: ({
    open,
    source,
    target,
  }: {
    open: boolean;
    source: string;
    target: string;
  }) =>
    open ? (
      <output data-testid="edge-detail">
        {source} → {target}
      </output>
    ) : null,
}));

function Graph({ fullscreen = false }: { fullscreen?: boolean }) {
  const fallbackRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  return (
    <ThemeProvider theme={theme}>
      <div ref={fallbackRef} data-testid="normal-view" />
      <div ref={targetRef} data-testid="fullscreen-view" />
      <PortalBridge
        active={fullscreen}
        fallbackRef={fallbackRef}
        targetRef={targetRef}
        id="tmGraph"
      >
        <TMGraphWrapper />
      </PortalBridge>
    </ThemeProvider>
  );
}

function currentCore() {
  return state.cores.at(-1)!;
}
function graphCanvas() {
  return document.querySelector<HTMLDivElement>('#TMGraph > div')!;
}
function resize(width: number, height: number) {
  act(() => {
    state.width = width;
    state.height = height;
    state.observers
      .filter((observer) => !observer.disconnected)
      .forEach((observer) => observer.callback());
  });
}
function completeLayout() {
  act(() => {
    state.running = false;
    state.completed += 1;
    state.onLayout!(
      new Map(
        [...useGlobalZustand.getState().states].map((id, index) => [
          id,
          { x: 100 + index * 200, y: 100 },
        ])
      )
    );
  });
}
async function settleFrames() {
  await act(async () => vi.advanceTimersByTimeAsync(100));
}

beforeEach(() => {
  vi.useFakeTimers();
  state.running = true;
  state.completed = 0;
  state.width = 800;
  state.height = 600;
  state.cores = [];
  state.observers = [];
  state.fit.mockClear();
  state.restart.mockClear();
  useGlobalZustand.getState().reset();
  useGlobalZustand.setState({
    states: new Set(['a', 'b']),
    transitions: new Map([
      [
        'a',
        [
          {
            from: 'a',
            to: 'b',
            tapecondition: [{}],
            write: [{}],
            direction: [Move.S],
          },
        ],
      ],
    ]),
    startState: 'a',
    currentState: 'a',
    lastState: '',
    lastTransition: -1,
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    () => state.width
  );
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
    () => state.height
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      record: ObserverRecord;
      constructor(callback: () => void) {
        this.record = {
          callback,
          core: state.cores.at(-1) ?? null,
          observed: null,
          disconnected: false,
        };
        state.observers.push(this.record);
      }
      observe(element: Element) {
        this.record.observed = element;
      }
      disconnect() {
        this.record.disconnected = true;
      }
    }
  );
});
afterEach(() => {
  cleanup();
  state.cores.forEach((cy) => cy.destroy());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TM graph viewport lifecycle', () => {
  it('attaches its resize observer after creating the core and disconnects on unmount', () => {
    const view = render(<Graph />);
    expect(state.observers).toHaveLength(1);
    expect(state.observers[0].core).toBe(currentCore());
    expect(state.observers[0].observed).toBe(graphCanvas());
    expect(state.observers[0].disconnected).toBe(false);
    view.unmount();
    expect(state.observers[0].disconnected).toBe(true);
    expect(currentCore().destroyed()).toBe(true);
  });

  it('keeps layout hidden until a completed layout is fitted on the next frame', async () => {
    render(<Graph />);
    expect(graphCanvas()).toHaveStyle({ opacity: '0', pointerEvents: 'none' });
    completeLayout();
    expect(graphCanvas()).toHaveStyle({ opacity: '0' });
    expect(state.fit).not.toHaveBeenCalled();
    await settleFrames();
    expect(state.fit).toHaveBeenCalledOnce();
    expect(graphCanvas()).toHaveStyle({ opacity: '1', pointerEvents: 'auto' });
    expect(screen.queryByText('Calculating layout...')).not.toBeInTheDocument();
  });

  it('finishes computation while hidden and defers its fit and reveal until resize makes it visible', async () => {
    render(<Graph />);
    resize(0, 0);
    completeLayout();
    await settleFrames();
    expect(state.fit).not.toHaveBeenCalled();
    expect(graphCanvas()).toHaveStyle({ opacity: '0' });
    resize(800, 600);
    expect(graphCanvas()).toHaveStyle({ opacity: '0' });
    await settleFrames();
    expect(state.fit).toHaveBeenCalledOnce();
    expect(graphCanvas()).toHaveStyle({ opacity: '1' });
  });

  it('preserves graph instance, pan and zoom when moving to fullscreen and back', async () => {
    const view = render(<Graph />);
    completeLayout();
    await settleFrames();
    const cy = currentCore();
    act(() => {
      cy.zoom(1.3);
      cy.pan({ x: -23, y: 87 });
    });
    const canvas = graphCanvas();
    view.rerender(<Graph fullscreen />);
    resize(1280, 900);
    await settleFrames();
    expect(screen.getByTestId('fullscreen-view')).toContainElement(canvas);
    expect(currentCore()).toBe(cy);
    expect(cy.zoom()).toBe(1.3);
    expect(cy.pan()).toEqual({ x: -23, y: 87 });
    view.rerender(<Graph />);
    resize(800, 600);
    await settleFrames();
    expect(screen.getByTestId('normal-view')).toContainElement(canvas);
    expect(currentCore()).toBe(cy);
    expect(cy.zoom()).toBe(1.3);
    expect(cy.pan()).toEqual({ x: -23, y: 87 });
    expect(state.fit).toHaveBeenCalledOnce();
  });

  it('cancels a queued fit when a newer topology starts loading', async () => {
    render(<Graph />);
    completeLayout();
    act(() => {
      state.running = true;
      useGlobalZustand.setState({ states: new Set(['a', 'b', 'c']) });
    });
    await settleFrames();
    expect(state.fit).not.toHaveBeenCalled();
    expect(graphCanvas()).toHaveStyle({ opacity: '0' });
    completeLayout();
    await settleFrames();
    expect(state.fit).toHaveBeenCalledOnce();
    expect(graphCanvas()).toHaveStyle({ opacity: '1' });
  });

  it('retains selected edge details and the graph instance during current-state updates', async () => {
    render(<Graph />);
    completeLayout();
    await settleFrames();
    const cy = currentCore();
    act(() => cy.getElementById('a→b').emit('tap'));
    expect(screen.getByTestId('edge-detail')).toHaveTextContent('a → b');
    act(() => useGlobalZustand.setState({ currentState: 'b', lastState: 'a' }));
    expect(screen.getByTestId('edge-detail')).toHaveTextContent('a → b');
    expect(currentCore()).toBe(cy);
    expect(cy.getElementById('b').hasClass('current')).toBe(true);
    expect(state.fit).toHaveBeenCalledOnce();
  });

  it('rebinds and cleans observers during StrictMode replay without losing the initial layout', async () => {
    const view = render(
      <StrictMode>
        <Graph />
      </StrictMode>
    );
    expect(state.cores).toHaveLength(2);
    expect(state.cores[0].destroyed()).toBe(true);
    expect(state.observers).toHaveLength(2);
    expect(state.observers[0].disconnected).toBe(true);
    expect(state.observers[1].core).toBe(currentCore());
    expect(state.observers[1].disconnected).toBe(false);
    await settleFrames();
    expect(state.restart).toHaveBeenCalledOnce();
    completeLayout();
    await settleFrames();
    expect(state.fit).toHaveBeenCalledOnce();
    expect(graphCanvas()).toHaveStyle({ opacity: '1' });
    view.unmount();
    expect(state.observers.every((observer) => observer.disconnected)).toBe(true);
    expect(state.cores.every((cy) => cy.destroyed())).toBe(true);
  });
});
