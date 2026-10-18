import type { MouseEvent } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useHoverPopper } from '@components/ConfigGraph/hooks/useHoverPopper';
import { GraphUIProvider, useGraphUI } from '@components/shared/GraphUIContext';

const hoverEvent = { clientX: 120, clientY: 240 } as MouseEvent;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('graph detail visibility', () => {
  it('hides selected details on inactive tabs and preserves their anchor for return', () => {
    const view = renderHook(({ active }) => useHoverPopper(200, true, active), {
      initialProps: { active: true },
    });
    const anchor = { top: 240, left: 120 };

    act(() => view.result.current.setAnchorPos(anchor));
    expect(view.result.current.open).toBe(true);

    view.rerender({ active: false });
    expect(view.result.current.open).toBe(false);
    expect(view.result.current.anchorPos).toEqual(anchor);

    view.rerender({ active: true });
    expect(view.result.current.open).toBe(true);
    expect(view.result.current.anchorPos).toEqual(anchor);
  });

  it('cancels a pending hover when leaving a tab without reopening it on return', () => {
    const view = renderHook(({ active }) => useHoverPopper(200, false, active), {
      initialProps: { active: true },
    });

    act(() => view.result.current.onMouseEnter(hoverEvent));
    act(() => vi.advanceTimersByTime(100));
    view.rerender({ active: false });
    act(() => vi.advanceTimersByTime(200));
    expect(view.result.current.open).toBe(false);

    view.rerender({ active: true });
    expect(view.result.current.open).toBe(false);
    expect(view.result.current.hovering).toBe(false);

    act(() => view.result.current.onMouseEnter(hoverEvent));
    act(() => vi.advanceTimersByTime(200));
    expect(view.result.current.open).toBe(true);

    view.rerender({ active: false });
    view.rerender({ active: true });
    expect(view.result.current.open).toBe(false);
  });

  it('ignores hover events while inactive', () => {
    const view = renderHook(() => useHoverPopper(200, false, false));

    act(() => view.result.current.onMouseEnter(hoverEvent));
    act(() => vi.advanceTimersByTime(200));

    expect(view.result.current.open).toBe(false);
    expect(view.result.current.hovering).toBe(false);
    expect(view.result.current.anchorPos).toBeNull();
  });

  it('preserves an inactive selection when the user drags in another graph', () => {
    const view = renderHook(({ active }) => useHoverPopper(200, true, active), {
      initialProps: { active: true },
    });
    const anchor = { top: 240, left: 120 };
    act(() => view.result.current.setAnchorPos(anchor));
    view.rerender({ active: false });

    act(() => {
      window.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10 }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 30 }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 30 }));
    });

    expect(view.result.current.open).toBe(false);
    expect(view.result.current.anchorPos).toEqual(anchor);
    view.rerender({ active: true });
    expect(view.result.current.open).toBe(true);

    act(() => {
      window.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10 }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 30 }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 30 }));
    });
    expect(view.result.current.open).toBe(false);
  });

  it('tracks the hover anchor but keeps a selected anchor fixed', () => {
    const view = renderHook(({ selected }) => useHoverPopper(200, selected), {
      initialProps: { selected: false },
    });
    act(() => view.result.current.onMouseEnter(hoverEvent));
    expect(view.result.current.virtualAnchor.getBoundingClientRect()).toMatchObject({
      top: 240,
      left: 120,
      width: 0,
      height: 0,
    });
    act(() =>
      view.result.current.onMouseMove({ clientX: 130, clientY: 250 } as MouseEvent)
    );
    expect(view.result.current.anchorPos).toEqual({ top: 258, left: 138 });
    act(() => vi.advanceTimersByTime(199));
    expect(view.result.current.open).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(view.result.current.open).toBe(true);

    view.rerender({ selected: true });
    act(() => view.result.current.setAnchorPos({ top: 400, left: 300 }));
    act(() => {
      view.result.current.onMouseMove(hoverEvent);
      view.result.current.onMouseLeave();
    });
    expect(view.result.current.open).toBe(true);
    expect(view.result.current.anchorPos).toEqual({ top: 400, left: 300 });

    view.rerender({ selected: false });
    expect(view.result.current.open).toBe(false);
  });

  it('cancels delayed hover on drag and starts a new delay on the next hover', () => {
    const view = renderHook(() => useHoverPopper(200));
    act(() => view.result.current.onMouseEnter(hoverEvent));
    act(() => vi.advanceTimersByTime(100));
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10 }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 30 }));
    });
    act(() => vi.advanceTimersByTime(200));
    expect(view.result.current.open).toBe(false);
    expect(view.result.current.anchorPos).toBeNull();
    act(() => view.result.current.onMouseEnter(hoverEvent));
    expect(view.result.current.hovering).toBe(false);

    act(() => window.dispatchEvent(new MouseEvent('pointerup', { clientX: 30 })));
    act(() => view.result.current.onMouseEnter(hoverEvent));
    act(() => vi.advanceTimersByTime(199));
    expect(view.result.current.open).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(view.result.current.open).toBe(true);
  });

  it('shares graph activity without resetting the selection', () => {
    let graphActive = true;
    const view = renderHook(useGraphUI, {
      wrapper: ({ children }) => (
        <GraphUIProvider active={graphActive}>{children}</GraphUIProvider>
      ),
    });
    const selected = {
      type: 'edge' as const,
      id: 'first-edge',
      anchor: { top: 240, left: 120 },
    };
    act(() => view.result.current.setSelected(selected));

    graphActive = false;
    view.rerender();
    expect(view.result.current.active).toBe(false);
    expect(view.result.current.selected).toEqual(selected);

    graphActive = true;
    view.rerender();
    expect(view.result.current.active).toBe(true);
    expect(view.result.current.selected).toEqual(selected);
  });
});
