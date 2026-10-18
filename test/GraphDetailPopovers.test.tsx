import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EdgeTooltip } from '@components/ConfigGraph/edges/EdgeTooltip';
import { ConfigurationDetailPopper } from '@components/shared/ConfigurationDetailPopper';

vi.mock('@components/ConfigGraph/ConfigVisualization/ConfigCard', () => ({
  default: () => <button>Configuration action</button>,
}));

const anchor = {
  getBoundingClientRect: () => new DOMRect(200, 200, 0, 0),
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function GraphClickHarness({
  target,
  detail = 'edge',
}: {
  target: 'node' | 'edge';
  detail?: 'node' | 'edge';
}) {
  const [selected, setSelected] = useState('hover');
  return (
    <>
      <button onMouseUp={() => setSelected(target)}>Graph element</button>
      <output data-testid="selection">{selected}</output>
      {detail === 'edge' ? (
        <EdgeTooltip
          open={selected !== 'none'}
          anchorEl={anchor}
          sourceLabel="q0"
          targetLabel="q1"
          onClose={() => setSelected('none')}
        />
      ) : (
        <ConfigurationDetailPopper
          config={{ state: 'q0', tapes: [], heads: [] }}
          pendingInteractive={false}
          anchor={{ top: 200, left: 200 }}
          open={selected !== 'none'}
          onClose={() => setSelected('none')}
        />
      )}
    </>
  );
}

describe.each(['node', 'edge'] as const)(
  '%s detail pointer interactions',
  (detail) => {
    it.each(['node', 'edge'] as const)(
      'does not erase a %s selection made by the same pointer gesture',
      async (target) => {
        render(<GraphClickHarness target={target} detail={detail} />);
        await act(async () => vi.advanceTimersByTimeAsync(1));

        const element = screen.getByRole('button', { name: 'Graph element' });
        // Cytoscape emits tap on mouseup, before the native document click.
        fireEvent.mouseDown(element);
        fireEvent.mouseUp(element);
        fireEvent.click(element);

        expect(screen.getByTestId('selection')).toHaveTextContent(target);
      }
    );

    it.each(['mouseDown', 'touchStart'] as const)(
      'dismisses an existing detail on an outside %s before a new selection',
      async (event) => {
        render(<GraphClickHarness target="edge" detail={detail} />);
        await act(async () => vi.advanceTimersByTimeAsync(1));
        fireEvent[event](document.body);
        expect(screen.getByTestId('selection')).toHaveTextContent('none');
      }
    );
  }
);

it('allows graph hits through the entire edge tooltip overlay', () => {
  render(<GraphClickHarness target="edge" />);
  expect(screen.getByRole('tooltip')).toHaveStyle({ pointerEvents: 'none' });
});

it('keeps node details interactive and dismisses the next outside gesture', async () => {
  render(<GraphClickHarness target="node" detail="node" />);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  const action = screen.getByRole('button', { name: 'Configuration action' });
  fireEvent.mouseDown(action);
  fireEvent.mouseUp(action);
  fireEvent.click(action);
  expect(screen.getByTestId('selection')).toHaveTextContent('hover');
  fireEvent.mouseDown(document.body);
  expect(screen.getByTestId('selection')).toHaveTextContent('none');
});
