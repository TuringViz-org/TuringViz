import type { ElkLayoutEngine } from '@components/shared/layout/elkWorkerClient';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runElkLayoutWithTimeout } from '@components/shared/layout/elkUtils';

const graph = { id: 'root' };
const worker = (layout: ReturnType<typeof vi.fn>) =>
  ({ layout, terminateWorker: vi.fn() }) satisfies ElkLayoutEngine;

describe('ELK layout deadline', () => {
  afterEach(() => vi.useRealTimers());

  it('releases the deadline after successful completion', async () => {
    vi.useFakeTimers();
    const layout = vi.fn().mockResolvedValue(graph);
    await expect(
      runElkLayoutWithTimeout(worker(layout), graph, 12000)
    ).resolves.toBe(graph);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles cancelled jobs without waiting for a terminated worker or its timeout', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const layout = vi.fn(() => new Promise(() => {}));
    const pending = runElkLayoutWithTimeout(
      worker(layout),
      graph,
      12000,
      controller.signal
    );
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not dispatch a job that has already been cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const layout = vi.fn();
    await expect(
      runElkLayoutWithTimeout(worker(layout), graph, 12000, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(layout).not.toHaveBeenCalled();
  });

  it('rejects stalled jobs at the deadline', async () => {
    vi.useFakeTimers();
    const pending = runElkLayoutWithTimeout(
      worker(vi.fn(() => new Promise(() => {}))),
      graph,
      12000
    );
    const rejected = expect(pending).rejects.toThrow(
      'ELK layout timed out after 12000ms'
    );
    await vi.advanceTimersByTimeAsync(12000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});
