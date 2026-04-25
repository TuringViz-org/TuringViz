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
  const actual = await vi.importActual<typeof import('@components/shared/layout/elkUtils')>(
    '@components/shared/layout/elkUtils'
  );

  return {
    ...actual,
    createElkWithWorker: createElkWithWorkerMock,
    runElkLayoutWithTimeout: runElkLayoutWithTimeoutMock,
  };
});

type HarnessProps = {
  restartVersion: number;
  onLayout: (positions: Map<string, { x: number; y: number }>) => void;
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

function Harness({ restartVersion, onLayout }: HarnessProps) {
  const lastRestartVersionRef = useRef(0);
  const { restart } = useElkLayout({
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
    autoDirection: false,
    onLayout,
  });

  useEffect(() => {
    if (restartVersion === lastRestartVersionRef.current) return;
    lastRestartVersionRef.current = restartVersion;
    restart();
  }, [restartVersion, restart]);

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
});
