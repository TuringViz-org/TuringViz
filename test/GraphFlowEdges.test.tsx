import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GraphUIProvider, useGraphUI } from '@components/shared/GraphUIContext';
import { InteractiveEdge } from '@components/ConfigGraph/edges/InteractiveEdge';
import { HOVER_POPPER_DELAY_MS } from '@utils/constants';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function SelectionControls() {
  const { selected, setSelected, setHighlightedEdgeId } = useGraphUI();
  return (
    <>
      <output data-testid="selection">{JSON.stringify(selected)}</output>
      <button onClick={() => setHighlightedEdgeId('edge')}>Highlight edge</button>
      <button onClick={() => setSelected({ type: null, id: null })}>
        Clear selection
      </button>
    </>
  );
}

function renderEdge(active = true) {
  const onGraphClick = vi.fn();
  const view = render(
    <GraphUIProvider active={active}>
      <SelectionControls />
      <div onClick={onGraphClick}>
        <svg>
          <InteractiveEdge
            id="edge"
            path="M 40,40 L 200,40"
            markerEnd="url(#arrow)"
            style={{ stroke: '#999', strokeWidth: 4, strokeDasharray: '6 4' }}
            tooltip={{ sourceLabel: 'q0', targetLabel: 'q1' }}
          />
        </svg>
      </div>
    </GraphUIProvider>
  );
  const path = view.container.querySelector('.react-flow__edge-path')!;
  const hit = view.container.querySelector('path[stroke="transparent"]')!;
  return { ...view, path, hit, onGraphClick };
}

describe('React Flow edge interactions', () => {
  it('keeps the visible path, arrow and enlarged hit area aligned', () => {
    const { path, hit } = renderEdge();
    expect(path).toHaveAttribute('d', 'M 40,40 L 200,40');
    expect(hit).toHaveAttribute('d', path.getAttribute('d'));
    expect(path).toHaveAttribute('marker-end', 'url(#arrow)');
    expect(path).toHaveStyle({
      strokeWidth: '4',
      strokeDasharray: '6 4',
      opacity: '0.85',
    });
    expect(hit).toHaveAttribute('stroke-width', '19');
    expect(hit).toHaveStyle({ pointerEvents: 'stroke', cursor: 'pointer' });
  });

  it('retains highlight, hover and selection precedence without changing the base style', () => {
    const { path, hit } = renderEdge();
    fireEvent.click(screen.getByRole('button', { name: 'Highlight edge' }));
    expect(path).toHaveStyle({ strokeWidth: '7', opacity: '0.95' });
    fireEvent.mouseEnter(hit, { clientX: 100, clientY: 200 });
    expect(path).toHaveStyle({
      strokeWidth: '6.2',
      opacity: '1',
      strokeDasharray: '6 4',
    });
    fireEvent.mouseLeave(hit);
    expect(path).toHaveStyle({ strokeWidth: '7', opacity: '0.95' });
    fireEvent.click(hit, { clientX: 100, clientY: 200 });
    expect(path).toHaveStyle({ strokeWidth: '6.2', opacity: '1' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(path).toHaveStyle({ strokeWidth: '7', opacity: '0.95' });
  });

  it('opens only after the hover delay and closes on leave', () => {
    const { hit } = renderEdge();
    fireEvent.mouseEnter(hit, { clientX: 100, clientY: 200 });
    act(() => vi.advanceTimersByTime(HOVER_POPPER_DELAY_MS - 1));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('tooltip')).toHaveTextContent('q0 → q1');
    fireEvent.mouseLeave(hit);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('selects at the click position without forwarding the click to the graph pane', () => {
    const { hit, onGraphClick } = renderEdge();
    fireEvent.click(hit, { clientX: 100, clientY: 200 });
    expect(JSON.parse(screen.getByTestId('selection').textContent!)).toEqual({
      type: 'edge',
      id: 'edge',
      anchor: { top: 200, left: 100 },
    });
    expect(onGraphClick).not.toHaveBeenCalled();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(hit);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('keeps inactive graph details closed', () => {
    const { hit } = renderEdge(false);
    fireEvent.mouseEnter(hit, { clientX: 100, clientY: 200 });
    act(() => vi.advanceTimersByTime(HOVER_POPPER_DELAY_MS));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
