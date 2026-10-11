import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelComputationTreeCompute,
  computeComputationTreeInWorker,
} from '@utils/graphWorkerClient';

const computeTree = vi.hoisted(() => vi.fn());
vi.mock('@tmfunctions/ComputationTree', () => ({
  getComputationTreeFromInputs: computeTree,
}));

describe('computation tree worker cancellation', () => {
  afterEach(() => {
    cancelComputationTreeCompute();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('terminates abandoned work and cancels its synchronous timeout fallback', async () => {
    vi.useFakeTimers();
    const terminate = vi.fn();
    vi.stubGlobal(
      'Worker',
      class {
        terminate = terminate;
        addEventListener = vi.fn();
        postMessage = vi.fn();
      }
    );

    const pending = computeComputationTreeInWorker({
      depth: 17000,
      targetNodes: 17000,
      transitions: new Map(),
      numberOfTapes: 1,
      blank: '_',
      startConfig: { state: 'q0', tapes: [[[], []]], heads: [0] },
    });
    const rejected = expect(pending).rejects.toThrow('Tree worker reset');
    cancelComputationTreeCompute();
    await rejected;
    await vi.advanceTimersByTimeAsync(5000);

    expect(terminate).toHaveBeenCalledOnce();
    expect(computeTree).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
