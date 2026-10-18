import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedLayoutRestart } from '@hooks/useDebouncedLayoutRestart';
import { useGraphLayoutRequest } from '@hooks/useGraphLayoutRequest';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('graph layout scheduling', () => {
  it('preserves initial measured layout requests during StrictMode effect replay', () => {
    const restart = vi.fn();
    const prepare = vi.fn();
    renderHook(
      () => {
        const schedule = useDebouncedLayoutRestart({ restart });
        useGraphLayoutRequest('machine:topology', true, prepare, schedule);
      },
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <StrictMode>{children}</StrictMode>
        ),
      }
    );
    expect(restart).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(20));
    expect(restart).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
  });

  it('coalesces revisions, reads the latest layout API, and cancels on unmount', () => {
    const oldRestart = vi.fn();
    const restart = vi.fn();
    const prepare = vi.fn();
    const view = renderHook(
      ({ revision, ready, run }) => {
        const schedule = useDebouncedLayoutRestart({ restart: run });
        useGraphLayoutRequest(revision, ready, prepare, schedule);
      },
      { initialProps: { revision: 'a', ready: false, run: oldRestart } }
    );
    view.rerender({ revision: 'a', ready: true, run: oldRestart });
    view.rerender({ revision: 'b', ready: true, run: restart });
    act(() => vi.advanceTimersByTime(20));
    expect(oldRestart).not.toHaveBeenCalled();
    expect(restart).toHaveBeenCalledOnce();
    view.rerender({ revision: 'b', ready: true, run: restart });
    act(() => vi.advanceTimersByTime(20));
    expect(restart).toHaveBeenCalledOnce();
    view.rerender({ revision: 'c', ready: true, run: restart });
    view.unmount();
    act(() => vi.advanceTimersByTime(20));
    expect(restart).toHaveBeenCalledOnce();
  });
});
