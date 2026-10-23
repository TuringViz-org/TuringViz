import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelComputationTreeCompute,
  cancelConfigGraphCompute,
  computeComputationTreeInWorker,
  computeConfigGraphInWorker,
  GraphComputeCancelledError,
} from '@utils/graphWorkerClient';
import { DEFAULT_CONFIG_GRAPH_TARGET_NODES } from '@utils/constants';
import type {
  GraphComputeRequest,
  GraphComputeResponse,
} from '../src/workers/graphComputeProtocol';
import type { Configuration } from '@mytypes/TMTypes';
import { packConfigGraph } from '../src/workers/configGraphCodec';

const { computeTree, computeConfig } = vi.hoisted(() => ({
  computeTree: vi.fn(),
  computeConfig: vi.fn(),
}));
vi.mock('@tmfunctions/ComputationTree', () => ({
  getComputationTreeFromInputs: computeTree,
}));
vi.mock('@tmfunctions/configGraphModel', () => ({
  computeConfigGraph: computeConfig,
}));

class TestWorker {
  static instances: TestWorker[] = [];
  request!: GraphComputeRequest;
  listener?: (event: MessageEvent<GraphComputeResponse>) => void;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn((request: GraphComputeRequest) => {
    this.request = request;
  });
  addEventListener = vi.fn((type: string, listener: TestWorker['listener']) => {
    if (type === 'message') this.listener = listener;
  });

  constructor() {
    TestWorker.instances.push(this);
  }

  reply(result: unknown, request = this.request) {
    this.listener?.({
      data: { id: request.id, type: request.type, result },
    } as MessageEvent<GraphComputeResponse>);
  }
}

const startConfig: Configuration = { state: 'q0', tapes: [[[], []]], heads: [0] };
const payload = {
  depth: 17000,
  targetNodes: 17000,
  transitions: new Map(),
  numberOfTapes: 1,
  blank: '_',
  startConfig,
};

function latestWorker() {
  return TestWorker.instances.at(-1)!;
}

describe('graph computation worker channels', () => {
  beforeEach(() => {
    TestWorker.instances = [];
    computeTree.mockReset();
    computeConfig.mockReset();
    vi.stubGlobal('Worker', TestWorker);
  });

  afterEach(() => {
    cancelComputationTreeCompute();
    cancelConfigGraphCompute();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('terminates abandoned work and cancels its synchronous timeout fallback', async () => {
    vi.useFakeTimers();
    const pending = computeComputationTreeInWorker(payload);
    const worker = latestWorker();
    const rejected = expect(pending).rejects.toThrow('Tree worker reset');
    cancelComputationTreeCompute();
    await rejected;
    await vi.advanceTimersByTimeAsync(5000);

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(computeTree).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('supersedes only the same graph kind and ignores late results', async () => {
    const oldTree = computeComputationTreeInWorker(payload);
    const oldWorker = latestWorker();
    const rejected = expect(oldTree).rejects.toBeInstanceOf(
      GraphComputeCancelledError
    );
    const config = computeConfigGraphInWorker(payload);
    const configWorker = latestWorker();
    const tree = computeComputationTreeInWorker({ ...payload, targetNodes: 400 });
    const treeWorker = latestWorker();
    await rejected;

    oldWorker.reply('stale');
    oldWorker.onerror?.();
    configWorker.reply('config result');
    treeWorker.reply('tree result');
    await expect(config).resolves.toBe('config result');
    await expect(tree).resolves.toBe('tree result');
    expect(configWorker.terminate).not.toHaveBeenCalled();
    expect(computeTree).not.toHaveBeenCalled();
  });

  it('reuses a finished worker without accepting a previous response twice', async () => {
    const first = computeComputationTreeInWorker(payload);
    const worker = latestWorker();
    const firstRequest = worker.request;
    worker.reply('first');
    await expect(first).resolves.toBe('first');

    const second = computeComputationTreeInWorker(payload);
    worker.reply('duplicate', firstRequest);
    worker.reply('second');
    await expect(second).resolves.toBe('second');
    expect(TestWorker.instances).toHaveLength(1);
  });

  it('replaces an idle worker that fails after completing a request', async () => {
    const first = computeComputationTreeInWorker(payload);
    const failed = latestWorker();
    failed.reply('first');
    await first;
    failed.onerror?.();
    expect(failed.terminate).toHaveBeenCalledOnce();

    const next = computeComputationTreeInWorker(payload);
    expect(latestWorker()).not.toBe(failed);
    latestWorker().reply('next');
    await expect(next).resolves.toBe('next');
  });

  it.each(['tree', 'config'] as const)(
    'keeps the requested %s node budget in timeout fallback',
    async (kind) => {
      vi.useFakeTimers();
      const compute = kind === 'tree' ? computeTree : computeConfig;
      compute.mockReturnValue('fallback result');
      const pending =
        kind === 'tree'
          ? computeComputationTreeInWorker(payload)
          : computeConfigGraphInWorker(payload);
      const worker = latestWorker();
      await vi.advanceTimersByTimeAsync(4500);
      await expect(pending).resolves.toBe('fallback result');
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      if (kind === 'tree') {
        expect(compute).toHaveBeenCalledWith(
          startConfig,
          payload.transitions,
          1,
          '_',
          17000,
          false,
          undefined,
          17000
        );
      } else {
        expect(compute).toHaveBeenCalledWith(
          startConfig,
          17000,
          payload.transitions,
          1,
          '_'
        );
      }
      worker.reply('late result');
      expect(compute).toHaveBeenCalledOnce();
    }
  );

  it.each(['onerror', 'onmessageerror'] as const)(
    'falls back after %s and replaces the failed worker',
    async (event) => {
      computeTree.mockReturnValue('fallback');
      const pending = computeComputationTreeInWorker(payload);
      const failed = latestWorker();
      failed[event]?.();
      await expect(pending).resolves.toBe('fallback');
      expect(failed.terminate).toHaveBeenCalledOnce();

      const next = computeComputationTreeInWorker(payload);
      expect(latestWorker()).not.toBe(failed);
      failed[event]?.();
      latestWorker().reply('next');
      await expect(next).resolves.toBe('next');
      expect(computeTree).toHaveBeenCalledOnce();
    }
  );

  it.each(['constructor', 'postMessage'] as const)(
    'settles requests when the worker %s throws',
    async (stage) => {
      computeTree.mockReturnValue('fallback');
      vi.stubGlobal(
        'Worker',
        class extends TestWorker {
          constructor() {
            super();
            if (stage === 'constructor') throw new Error('Worker unavailable');
            this.postMessage.mockImplementation(() => {
              throw new Error('Cannot clone');
            });
          }
        }
      );
      await expect(computeComputationTreeInWorker(payload)).resolves.toBe(
        'fallback'
      );
      expect(computeTree).toHaveBeenCalledOnce();
    }
  );

  it('rejects a worker-reported computation error and clears its timer', async () => {
    vi.useFakeTimers();
    const pending = computeComputationTreeInWorker(payload);
    const worker = latestWorker();
    const rejected = expect(pending).rejects.toThrow('Invalid machine');
    worker.listener?.({
      data: {
        id: worker.request.id,
        type: 'computationTree',
        error: { name: 'TypeError', message: 'Invalid machine' },
      },
    } as MessageEvent<GraphComputeResponse>);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a throwing timeout fallback instead of leaving the request pending', async () => {
    vi.useFakeTimers();
    computeTree.mockImplementation(() => {
      throw new Error('Invalid fallback');
    });
    const pending = computeComputationTreeInWorker(payload);
    const rejected = expect(pending).rejects.toThrow('Invalid fallback');
    await vi.advanceTimersByTimeAsync(4500);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the shared default budget without Worker support', async () => {
    vi.stubGlobal('Worker', undefined);
    computeConfig.mockReturnValue('fallback');
    await expect(
      computeConfigGraphInWorker({ ...payload, targetNodes: undefined })
    ).resolves.toBe('fallback');
    expect(computeConfig).toHaveBeenCalledWith(
      startConfig,
      DEFAULT_CONFIG_GRAPH_TARGET_NODES,
      payload.transitions,
      1,
      '_'
    );
  });

  it('rejects synchronous computation errors through its Promise contract', async () => {
    vi.stubGlobal('Worker', undefined);
    computeTree.mockImplementation(() => {
      throw new Error('Invalid fallback');
    });
    await expect(computeComputationTreeInWorker(payload)).rejects.toThrow(
      'Invalid fallback'
    );
  });

  it('cancels queued no-worker fallbacks on reset', async () => {
    vi.stubGlobal('Worker', undefined);
    const pending = computeComputationTreeInWorker(payload);
    const rejected = expect(pending).rejects.toBeInstanceOf(
      GraphComputeCancelledError
    );
    cancelComputationTreeCompute();
    await rejected;
    expect(computeTree).not.toHaveBeenCalled();
  });

  it('decodes compact config results while continuing to accept full results', async () => {
    const config: Configuration = {
      state: 'q0',
      tapes: [[[], [{ value: '🚀' }]]],
      heads: [-1],
    };
    const result = {
      startconfig: config,
      startconfighash: 'root',
      Graph: new Map([['root', { config, computed: false, next: [] }]]),
    };
    const packed = computeConfigGraphInWorker(payload);
    latestWorker().reply(packConfigGraph(result));
    await expect(packed).resolves.toEqual(result);
    const full = computeConfigGraphInWorker(payload);
    latestWorker().reply(result);
    await expect(full).resolves.toBe(result);
    expect(computeConfig).not.toHaveBeenCalled();
  });

  it('retries a malformed compact response using the current request after worker reuse', async () => {
    vi.useFakeTimers();
    const first = computeConfigGraphInWorker(payload);
    const worker = latestWorker();
    worker.reply('first');
    await first;
    computeConfig.mockReturnValue('recovered');
    const secondPayload = { ...payload, targetNodes: 42 };
    const second = computeConfigGraphInWorker(secondPayload);
    worker.reply({ format: 'config-graph-v1' });
    await expect(second).resolves.toBe('recovered');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(computeConfig).toHaveBeenCalledWith(
      startConfig,
      42,
      payload.transitions,
      1,
      '_'
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, undefined, {}, { name: 'Error', message: 42 }])(
    'recovers a malformed error response without leaving its request pending (%j)',
    async (error) => {
      vi.useFakeTimers();
      const first = computeConfigGraphInWorker(payload);
      const worker = latestWorker();
      worker.reply('first');
      await first;
      computeConfig.mockReturnValue('recovered');
      const pending = computeConfigGraphInWorker({ ...payload, targetNodes: 42 });

      expect(() =>
        worker.listener?.({
          data: {
            id: worker.request.id,
            type: 'configGraph',
            error,
          },
        } as unknown as MessageEvent<GraphComputeResponse>)
      ).not.toThrow();

      await expect(pending).resolves.toBe('recovered');
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(computeConfig).toHaveBeenCalledWith(
        startConfig,
        42,
        payload.transitions,
        1,
        '_'
      );
      worker.reply('late result');
      expect(computeConfig).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('ignores stale malformed responses before decoding or invoking fallback', async () => {
    const first = computeConfigGraphInWorker(payload);
    const abandoned = latestWorker();
    const rejected = expect(first).rejects.toBeInstanceOf(
      GraphComputeCancelledError
    );
    const second = computeConfigGraphInWorker(payload);
    await rejected;
    abandoned.reply({ format: 'config-graph-v1' });
    expect(() =>
      abandoned.listener?.({
        data: null,
      } as unknown as MessageEvent<GraphComputeResponse>)
    ).not.toThrow();
    latestWorker().reply('replacement');
    await expect(second).resolves.toBe('replacement');
    expect(computeConfig).not.toHaveBeenCalled();
  });
});
