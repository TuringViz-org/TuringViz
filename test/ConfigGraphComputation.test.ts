import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recomputeConfigGraphWithTargetNodes } from '@services/configGraphComputation';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import type { ConfigGraph } from '@tmfunctions/configGraphModel';
import type { Transition } from '@mytypes/TMTypes';

const { compute, cancel } = vi.hoisted(() => ({
  compute: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('@utils/graphWorkerClient', () => ({
  computeConfigGraphInWorker: compute,
  cancelConfigGraphCompute: cancel,
  isGraphComputeCancelled: (error: unknown) =>
    error instanceof Error && error.name === 'GraphComputeCancelledError',
}));

function graph(name: string): ConfigGraph {
  return {
    startconfig: { state: name, tapes: [[[], []]], heads: [0] },
    startconfighash: name,
    Graph: new Map(),
  };
}

function deferred() {
  let resolve!: (value: ConfigGraph) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<ConfigGraph>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  compute.mockReturnValueOnce(promise);
  return { resolve, reject };
}

function loadMachine() {
  useGlobalZustand
    .getState()
    .setAll(
      new Set(['q0']),
      'q0',
      new Map<string, Transition[]>([['q0', []]]),
      '_',
      1,
      [[[], [{ value: '_' }]]],
      graph('initial')
    );
}

describe('configuration graph publication', () => {
  beforeEach(() => {
    compute.mockReset();
    cancel.mockReset();
    useGlobalZustand.getState().reset();
    loadMachine();
  });
  afterEach(() => vi.restoreAllMocks());

  it('publishes graph and version atomically and completes its loading job', async () => {
    const job = deferred();
    const result = recomputeConfigGraphWithTargetNodes(1234);
    const version = useGlobalZustand.getState().configGraphVersion;
    expect(useGlobalZustand.getState().configGraphComputing).toBe(true);
    const seen: Array<[ConfigGraph | null, number]> = [];
    const unsubscribe = useGlobalZustand.subscribe((state) => {
      seen.push([state.configGraph, state.configGraphVersion]);
    });
    const replacement = graph('replacement');
    job.resolve(replacement);
    await expect(result).resolves.toBe(true);
    unsubscribe();
    expect(seen).toContainEqual([replacement, version + 1]);
    expect(seen).not.toContainEqual([replacement, version]);
    expect(useGlobalZustand.getState().configGraphComputing).toBe(false);
    expect(compute.mock.calls[0][0].targetNodes).toBe(1234);
  });

  it('ignores out-of-order results while keeping the newest request loading', async () => {
    const older = deferred();
    const first = recomputeConfigGraphWithTargetNodes(100);
    const newer = deferred();
    const second = recomputeConfigGraphWithTargetNodes(200);
    older.resolve(graph('old'));
    await expect(first).resolves.toBe(false);
    expect(useGlobalZustand.getState().configGraphComputing).toBe(true);
    expect(useGlobalZustand.getState().configGraph?.startconfighash).toBe('initial');
    newer.resolve(graph('new'));
    await expect(second).resolves.toBe(true);
    expect(useGlobalZustand.getState().configGraph?.startconfighash).toBe('new');
    expect(useGlobalZustand.getState().configGraphComputeJobs).toBe(0);
  });

  it.each(['load', 'reset'] as const)(
    'isolates stale completion after machine %s, even with the same start configuration',
    async (action) => {
      const older = deferred();
      const first = recomputeConfigGraphWithTargetNodes(100);
      if (action === 'reset') useGlobalZustand.getState().reset();
      loadMachine();
      expect(cancel).toHaveBeenCalled();
      const newer = deferred();
      const second = recomputeConfigGraphWithTargetNodes(200);
      older.resolve(graph('old'));
      await expect(first).resolves.toBe(false);
      expect(useGlobalZustand.getState().configGraphComputeJobs).toBe(1);
      expect(useGlobalZustand.getState().configGraphComputing).toBe(true);
      newer.resolve(graph('new'));
      await expect(second).resolves.toBe(true);
      expect(useGlobalZustand.getState().configGraphComputeJobs).toBe(0);
    }
  );

  it('does not publish after reset without a replacement job', async () => {
    const job = deferred();
    const result = recomputeConfigGraphWithTargetNodes(100);
    useGlobalZustand.getState().reset();
    job.resolve(graph('old'));
    await expect(result).resolves.toBe(false);
    expect(useGlobalZustand.getState().configGraph).toBeNull();
    expect(useGlobalZustand.getState().configGraphComputing).toBe(false);
  });

  it('keeps calculation independent of runtime configuration changes', async () => {
    const job = deferred();
    const result = recomputeConfigGraphWithTargetNodes(100);
    useGlobalZustand.getState().setCurrentState('running');
    useGlobalZustand.getState().setHeads([9]);
    expect(cancel).not.toHaveBeenCalled();
    job.resolve(graph('completed'));
    await expect(result).resolves.toBe(true);
  });

  it('releases failed jobs while retaining the displayed graph', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const job = deferred();
    const result = recomputeConfigGraphWithTargetNodes(100);
    job.reject(new Error('failed'));
    await expect(result).resolves.toBe(false);
    expect(useGlobalZustand.getState().configGraph?.startconfighash).toBe('initial');
    expect(useGlobalZustand.getState().configGraphComputing).toBe(false);
  });

  it('makes job completion callbacks idempotent', () => {
    const first = useGlobalZustand.getState().beginConfigGraphCompute();
    const second = useGlobalZustand.getState().beginConfigGraphCompute();
    first();
    first();
    expect(useGlobalZustand.getState().configGraphComputeJobs).toBe(1);
    second();
    expect(useGlobalZustand.getState().configGraphComputeJobs).toBe(0);
  });
});
