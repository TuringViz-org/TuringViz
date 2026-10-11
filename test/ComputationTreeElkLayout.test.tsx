import { act, render, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useElkLayout } from '@components/ComputationTree/layout/useElkLayout';

const runElkLayoutWithTimeoutMock = vi.hoisted(() => vi.fn());
const createElkWithWorkerMock = vi.hoisted(() =>
  vi.fn(() => ({
    terminateWorker: vi.fn(),
  }))
);
const toastWarningMock = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: {
    warning: toastWarningMock,
  },
}));

vi.mock('@components/shared/layout/elkUtils', async () => {
  const actual = await vi.importActual<
    typeof import('@components/shared/layout/elkUtils')
  >('@components/shared/layout/elkUtils');

  return {
    ...actual,
    createElkWithWorker: createElkWithWorkerMock,
    runElkLayoutWithTimeout: runElkLayoutWithTimeoutMock,
  };
});

type HarnessProps = {
  restartVersion: number;
  active?: boolean;
  onLayout: (positions: Map<string, { x: number; y: number }>) => void;
  onCompletedLayoutsChange?: (completedLayouts: number) => void;
};

function deferredPromise<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function Harness({
  restartVersion,
  active,
  onLayout,
  onCompletedLayoutsChange,
}: HarnessProps) {
  const lastRestartVersionRef = useRef(0);
  const { restart, completedLayouts } = useElkLayout({
    nodes: [
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 0, y: 0 }, data: {} },
      { id: 'c', position: { x: 0, y: 0 }, data: {} },
    ] as any,
    edges: [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'ac', source: 'a', target: 'c' },
    ] as any,
    autoRun: false,
    autoDirection: active !== undefined,
    autoResizeLayoutEnabled: active,
    viewportWidth: 800,
    viewportHeight: 600,
    onLayout,
  });

  useEffect(() => {
    if (restartVersion === lastRestartVersionRef.current) return;
    lastRestartVersionRef.current = restartVersion;
    restart();
  }, [restartVersion, restart]);

  useEffect(() => {
    onCompletedLayoutsChange?.(completedLayouts);
  }, [completedLayouts, onCompletedLayoutsChange]);

  return null;
}

describe('Computation tree ELK layout', () => {
  beforeEach(() => {
    runElkLayoutWithTimeoutMock.mockReset();
    createElkWithWorkerMock.mockClear();
    toastWarningMock.mockReset();
  });

  it('suppresses the failure toast for superseded layout runs', async () => {
    const firstRun = deferredPromise<any>();
    const onLayout = vi.fn();

    runElkLayoutWithTimeoutMock
      .mockImplementationOnce(() => firstRun.promise)
      .mockResolvedValueOnce({
        children: [
          { id: 'a', x: 10, y: 20 },
          { id: 'b', x: 30, y: 40 },
          { id: 'c', x: 50, y: 60 },
        ],
      });

    const view = render(<Harness restartVersion={1} onLayout={onLayout} />);

    view.rerender(<Harness restartVersion={2} onLayout={onLayout} />);

    await act(async () => {
      firstRun.reject(new Error('terminated'));
      await Promise.resolve();
    });

    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(1));
    expect(toastWarningMock).not.toHaveBeenCalled();
  });

  it('keeps the toast for a real current layout failure', async () => {
    const onLayout = vi.fn();

    runElkLayoutWithTimeoutMock.mockRejectedValueOnce(new Error('ELK failed'));

    render(<Harness restartVersion={1} onLayout={onLayout} />);

    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(1));
    expect(toastWarningMock).toHaveBeenCalledWith(
      'Layout failed. Please try again with fewer nodes.'
    );
  });

  it('increments the completion counter after applying the current layout', async () => {
    const onLayout = vi.fn();
    const onCompletedLayoutsChange = vi.fn();

    runElkLayoutWithTimeoutMock.mockResolvedValueOnce({
      children: [
        { id: 'a', x: 10, y: 20 },
        { id: 'b', x: 30, y: 40 },
        { id: 'c', x: 50, y: 60 },
      ],
    });

    render(
      <Harness
        restartVersion={1}
        onLayout={onLayout}
        onCompletedLayoutsChange={onCompletedLayoutsChange}
      />
    );

    await waitFor(() => expect(onLayout).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(onCompletedLayoutsChange).toHaveBeenLastCalledWith(1)
    );
  });

  it('does not recreate a worker after an abandoned layout fails', async () => {
    const pending = deferredPromise<any>();
    const onLayout = vi.fn();
    runElkLayoutWithTimeoutMock.mockImplementationOnce(() => pending.promise);

    const view = render(<Harness restartVersion={1} onLayout={onLayout} />);
    const workersCreated = createElkWithWorkerMock.mock.calls.length;
    const worker = createElkWithWorkerMock.mock.results[workersCreated - 1]!.value;
    view.unmount();
    expect(worker.terminateWorker).toHaveBeenCalledOnce();

    await act(async () => {
      pending.reject(new Error('terminated'));
      await Promise.resolve();
    });

    expect(createElkWithWorkerMock).toHaveBeenCalledTimes(workersCreated);
    expect(onLayout).not.toHaveBeenCalled();
    expect(toastWarningMock).not.toHaveBeenCalled();
  });

  it('retains the completed layout when a panel is hidden and shown again', async () => {
    runElkLayoutWithTimeoutMock.mockResolvedValueOnce({
      children: [
        { id: 'a', x: 10, y: 20 },
        { id: 'b', x: 30, y: 40 },
        { id: 'c', x: 50, y: 60 },
      ],
    });
    const onLayout = vi.fn();
    const view = render(<Harness restartVersion={1} active onLayout={onLayout} />);
    await waitFor(() => expect(onLayout).toHaveBeenCalledOnce());
    for (let i = 0; i < 5; i++) {
      view.rerender(
        <Harness restartVersion={1} active={false} onLayout={onLayout} />
      );
      view.rerender(<Harness restartVersion={1} active onLayout={onLayout} />);
    }
    expect(runElkLayoutWithTimeoutMock).toHaveBeenCalledOnce();
    expect(createElkWithWorkerMock).toHaveBeenCalledOnce();
    expect(onLayout).toHaveBeenCalledOnce();
  });
});
