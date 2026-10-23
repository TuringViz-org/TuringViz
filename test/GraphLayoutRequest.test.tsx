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
  it.each([
    ['string', 'machine:topology'],
    ['tuple', ['machine', 'topology']],
  ] as const)(
    'preserves %s requests during StrictMode effect replay',
    (_kind, revision) => {
      const restart = vi.fn();
      const prepare = vi.fn();
      renderHook(
        () => {
          const schedule = useDebouncedLayoutRestart({ restart });
          useGraphLayoutRequest(revision, true, prepare, schedule);
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
    }
  );

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

  it('compares tuple contents and coalesces changed revisions once ready', () => {
    const restart = vi.fn();
    const prepare = vi.fn();
    const view = renderHook(
      ({ revision, ready }) => {
        const schedule = useDebouncedLayoutRestart({ restart });
        useGraphLayoutRequest(revision, ready, prepare, schedule);
      },
      {
        initialProps: {
          revision: [1, 'nodes', 'q0\x01|q1\x01', 2] as (string | number)[],
          ready: false,
        },
      }
    );
    expect(prepare).not.toHaveBeenCalled();
    view.rerender({ revision: [1, 'nodes', 'q0\x01|q1\x01', 2], ready: true });
    view.rerender({ revision: [1, 'nodes', 'q0\x01|q1\x01', 2], ready: true });
    expect(prepare).toHaveBeenCalledOnce();
    view.rerender({ revision: [2, 'nodes', 'q0\x01|q1\x01', 2], ready: true });
    expect(prepare).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(20));
    expect(restart).toHaveBeenCalledOnce();

    view.rerender({ revision: [2, 'cards', 'q0\x01|q1\x01', 2], ready: false });
    expect(prepare).toHaveBeenCalledTimes(2);
    view.rerender({ revision: [2, 'cards', 'q0\x01|q1\x01', 2], ready: true });
    act(() => vi.advanceTimersByTime(20));
    expect(restart).toHaveBeenCalledTimes(2);
  });

  it('snapshots tuple members and detects in-place edits with stable callbacks', () => {
    const restart = vi.fn();
    const prepare = vi.fn();
    const revision = ['machine', 'first'];
    const view = renderHook(() =>
      useGraphLayoutRequest(revision, true, prepare, restart)
    );
    expect(restart).toHaveBeenCalledOnce();
    revision[1] = 'second';
    view.rerender();
    expect(restart).toHaveBeenCalledTimes(2);
    view.rerender();
    expect(restart).toHaveBeenCalledTimes(2);
    revision.push('new part');
    view.rerender();
    expect(restart).toHaveBeenCalledTimes(3);
  });
});
