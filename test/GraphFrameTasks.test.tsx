import { StrictMode, type PropsWithChildren } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGraphFrameTask } from '@hooks/useGraphFrameTask';
import { useGraphReveal } from '@hooks/useGraphReveal';

function nextFrame() {
  act(() => vi.advanceTimersByTime(16));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('graph viewport frame tasks', () => {
  it('only applies the newest fit and invalidates a pending async completion', async () => {
    const view = renderHook(() => useGraphFrameTask());
    const obsoleteFit = vi.fn();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const reveal = vi.fn();
    act(() => {
      view.result.current.schedule(obsoleteFit);
      view.result.current.schedule(async (isCurrent) => {
        await pending;
        if (isCurrent()) reveal();
      });
    });
    nextFrame();
    expect(obsoleteFit).not.toHaveBeenCalled();
    nextFrame();
    act(() => view.result.current.schedule(() => reveal('latest')));
    await act(async () => {
      finish();
      await pending;
    });
    expect(reveal).not.toHaveBeenCalled();
    nextFrame();
    nextFrame();
    expect(reveal).toHaveBeenCalledExactlyOnceWith('latest');
  });

  it('cancels queued work and stale continuations when the graph revision changes', () => {
    const view = renderHook(({ revision }) => useGraphFrameTask([revision]), {
      initialProps: { revision: 'old' },
    });
    let isCurrent!: () => boolean;
    act(() =>
      view.result.current.schedule((current) => {
        isCurrent = current;
      }, 1)
    );
    nextFrame();
    expect(isCurrent()).toBe(true);
    const queued = vi.fn();
    act(() => view.result.current.schedule(queued));
    view.rerender({ revision: 'new' });
    act(() => vi.runAllTimers());
    expect(isCurrent()).toBe(false);
    expect(queued).not.toHaveBeenCalled();
  });

  it('remains usable in StrictMode and never runs frames after unmount', () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <StrictMode>{children}</StrictMode>
    );
    const view = renderHook(() => useGraphFrameTask(), { wrapper });
    const fit = vi.fn();
    act(() => view.result.current.schedule(fit, 1));
    nextFrame();
    expect(fit).toHaveBeenCalledOnce();
    act(() => view.result.current.schedule(fit));
    view.unmount();
    act(() => vi.runAllTimers());
    expect(fit).toHaveBeenCalledOnce();
  });
});

describe('graph presentation reveal', () => {
  it('keeps the loader through both paint frames and the renderer settle interval', () => {
    const view = renderHook(({ blocked }) => useGraphReveal(blocked), {
      initialProps: { blocked: true },
    });
    expect(view.result.current).toBe(false);
    view.rerender({ blocked: false });
    nextFrame();
    nextFrame();
    expect(view.result.current).toBe(false);
    act(() => vi.advanceTimersByTime(89));
    expect(view.result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(view.result.current).toBe(true);
  });

  it('does not reveal an obsolete fit after loading restarts or the graph unmounts', () => {
    const view = renderHook(({ blocked }) => useGraphReveal(blocked), {
      initialProps: { blocked: false },
    });
    nextFrame();
    nextFrame();
    view.rerender({ blocked: true });
    act(() => vi.runAllTimers());
    expect(view.result.current).toBe(false);
    view.rerender({ blocked: false });
    nextFrame();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
