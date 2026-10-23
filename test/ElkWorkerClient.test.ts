import type { ElkNode } from '@openedges/elk-layout';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createElkWorkerClient,
  type ElkLayoutOutputOptions,
} from '@components/shared/layout/elkWorkerClient';
import type {
  ElkLayoutRequest,
  ElkLayoutResponse,
} from '../src/workers/elkLayoutProtocol';

const { createElk, layout } = vi.hoisted(() => ({
  createElk: vi.fn(),
  layout: vi.fn(),
}));

vi.mock('@components/shared/layout/elkWasmBackend', () => ({
  createElkWasmBackend: function (options?: ElkLayoutOutputOptions) {
    createElk(options);
    return { layout };
  },
}));

class TestWorker {
  static instances: TestWorker[] = [];
  readonly requests: ElkLayoutRequest[] = [];
  listener?: (event: MessageEvent<ElkLayoutResponse>) => void;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn((request: ElkLayoutRequest) => {
    this.requests.push(request);
  });
  addEventListener = vi.fn((type: string, listener: TestWorker['listener']) => {
    if (type === 'message') this.listener = listener;
  });

  constructor(
    readonly url: URL,
    readonly options: WorkerOptions
  ) {
    TestWorker.instances.push(this);
  }

  reply(result: ElkNode, request = this.requests.at(-1)!) {
    this.listener?.({
      data: { id: request.id, result },
    } as MessageEvent<ElkLayoutResponse>);
  }

  replyLegacy(result: ElkNode, request = this.requests.at(-1)!) {
    this.listener?.({
      data: { id: request.id, data: result },
    } as unknown as MessageEvent<ElkLayoutResponse>);
  }
}

const graph: ElkNode = {
  id: 'root',
  children: [{ id: 'q0', width: 50, height: 50 }],
  layoutOptions: { 'elk.algorithm': 'layered' },
};

function latestWorker() {
  return TestWorker.instances.at(-1)!;
}

describe('ELK worker transport', () => {
  beforeEach(() => {
    TestWorker.instances = [];
    createElk.mockReset();
    layout.mockReset();
    vi.stubGlobal('Worker', TestWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('creates a module worker lazily and reuses it for subsequent layouts', async () => {
    const elk = createElkWorkerClient('tree-layout');
    expect(TestWorker.instances).toHaveLength(0);
    const first = elk.layout(graph);
    const worker = latestWorker();
    expect(worker.options).toEqual({ type: 'module', name: 'tree-layout' });
    expect(worker.url.pathname).toMatch(/\/workers\/elkLayout\.worker\.ts$/);
    expect(worker.requests[0].positionsOnly).toBeUndefined();
    expect(worker.requests[0].graph.children?.[0].id).not.toBe('q0');
    expect(graph.children?.[0].id).toBe('q0');
    const result = { ...worker.requests[0].graph, x: 12, y: 12 };
    worker.reply(result);
    await expect(first).resolves.toEqual({ ...graph, x: 12, y: 12 });

    const second = elk.layout(graph);
    worker.reply(result);
    await expect(second).resolves.toEqual({ ...graph, x: 12, y: 12 });
    expect(TestWorker.instances).toHaveLength(1);
    expect(createElk).not.toHaveBeenCalled();
    elk.terminateWorker();
  });

  it('requests projected WASM output explicitly and restores original node IDs', async () => {
    const elk = createElkWorkerClient('positions-layout', { positionsOnly: true });
    const pending = elk.layout(graph);
    const worker = latestWorker();
    const request = worker.requests[0];
    expect(request.positionsOnly).toBe(true);
    worker.reply({
      id: request.graph.id,
      children: request.graph.children!.map(({ id, width, height }) => ({
        id,
        width,
        height,
        x: 12,
        y: 24,
      })),
    });
    await expect(pending).resolves.toEqual({
      id: 'root',
      children: [{ id: 'q0', width: 50, height: 50, x: 12, y: 24 }],
    });
    elk.terminateWorker();
  });

  it('matches concurrent responses by ID and ignores duplicate or unknown responses', async () => {
    const elk = createElkWorkerClient();
    const first = elk.layout(graph);
    const worker = latestWorker();
    const firstRequest = worker.requests[0];
    const second = elk.layout(graph);
    worker.reply({ id: 'unknown' }, { id: -1, graph });
    worker.reply({ id: 'second' });
    worker.reply({ id: 'duplicate' });
    worker.reply({ id: 'first' }, firstRequest);
    await expect(first).resolves.toEqual({ id: 'first' });
    await expect(second).resolves.toEqual({ id: 'second' });
    elk.terminateWorker();
  });

  it('uses the classic ELK.js protocol only when a developer algorithm is requested', async () => {
    const elk = createElkWorkerClient('tree-layout', { positionsOnly: true });
    const legacyGraph = {
      ...graph,
      layoutOptions: { 'elk.algorithm': 'org.eclipse.elk.radial' },
    };
    const pending = elk.layout(legacyGraph);
    const worker = latestWorker();
    expect(worker.options).toEqual({ name: 'tree-layout-legacy' });
    expect(worker.url.pathname).toMatch(/elkjs\/lib\/elk-worker\.js$/);
    expect(worker.requests).toEqual([
      {
        id: 0,
        cmd: 'register',
        algorithms: [
          'layered',
          'stress',
          'mrtree',
          'radial',
          'force',
          'disco',
          'sporeOverlap',
          'sporeCompaction',
          'rectpacking',
        ],
      },
      {
        id: 1,
        cmd: 'layout',
        graph: legacyGraph,
        layoutOptions: {},
        options: { logging: false, measureExecutionTime: false },
      },
    ]);
    worker.listener?.({ data: { id: 0 } } as MessageEvent<ElkLayoutResponse>);
    worker.replyLegacy(legacyGraph);
    await expect(pending).resolves.toBe(legacyGraph);
    expect(TestWorker.instances).toHaveLength(1);
    expect(createElk).not.toHaveBeenCalled();
    elk.terminateWorker();
  });

  it('keeps separate reusable workers while switching algorithms and ignores cross-worker responses', async () => {
    const elk = createElkWorkerClient();
    const first = elk.layout(graph);
    const wasmWorker = latestWorker();
    const legacyGraph = {
      ...graph,
      layoutOptions: { 'elk.algorithm': 'force' },
    };
    const legacy = elk.layout(legacyGraph);
    const legacyWorker = latestWorker();
    const second = elk.layout(graph);
    expect(TestWorker.instances).toHaveLength(2);
    legacyWorker.replyLegacy({ id: 'wrong' }, wasmWorker.requests[0]);
    wasmWorker.reply({ id: 'wrong' }, legacyWorker.requests[1]);
    legacyWorker.replyLegacy({ id: 'legacy' });
    wasmWorker.reply({ id: 'second' });
    wasmWorker.reply({ id: 'first' }, wasmWorker.requests[0]);
    await expect(first).resolves.toEqual({ id: 'first' });
    await expect(legacy).resolves.toEqual({ id: 'legacy' });
    await expect(second).resolves.toEqual({ id: 'second' });

    const next = elk.layout(legacyGraph);
    expect(legacyWorker.requests).toHaveLength(3);
    legacyWorker.replyLegacy({ id: 'next legacy' });
    await expect(next).resolves.toEqual({ id: 'next legacy' });
    elk.terminateWorker();
    expect(legacyWorker.terminate).toHaveBeenCalledOnce();
    expect(wasmWorker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects registration errors and terminates both workers and their pending jobs', async () => {
    const elk = createElkWorkerClient();
    const wasmPending = elk.layout(graph);
    const wasmWorker = latestWorker();
    const legacyPending = elk.layout({
      ...graph,
      layoutOptions: { 'elk.algorithm': 'mrtree' },
    });
    const legacyWorker = latestWorker();
    const rejected = Promise.all([
      expect(wasmPending).rejects.toThrow('Registration failed'),
      expect(legacyPending).rejects.toThrow('Registration failed'),
    ]);
    legacyWorker.listener?.({
      data: {
        id: 0,
        error: { name: 'Error', message: 'Registration failed' },
      },
    } as MessageEvent<ElkLayoutResponse>);
    await rejected;
    expect(wasmWorker.terminate).toHaveBeenCalledOnce();
    expect(legacyWorker.terminate).toHaveBeenCalledOnce();
    wasmWorker.reply(graph);
    legacyWorker.replyLegacy(graph);
    await expect(elk.layout(graph)).rejects.toThrow('Registration failed');
  });

  it('propagates a classic worker layout error and reuses that worker', async () => {
    const elk = createElkWorkerClient();
    const legacyGraph = {
      ...graph,
      layoutOptions: { 'elk.algorithm': 'stress' },
    };
    const pending = elk.layout(legacyGraph);
    const rejected = expect(pending).rejects.toThrow('Invalid legacy graph');
    const worker = latestWorker();
    worker.listener?.({
      data: {
        id: worker.requests[1].id,
        error: new Error('Invalid legacy graph'),
      },
    } as MessageEvent<ElkLayoutResponse>);
    await rejected;
    const next = elk.layout(legacyGraph);
    worker.replyLegacy(graph);
    await expect(next).resolves.toBe(graph);
    expect(TestWorker.instances).toHaveLength(1);
    elk.terminateWorker();
  });

  it('preserves WASM error names without starting a legacy fallback', async () => {
    const elk = createElkWorkerClient();
    const pending = elk.layout(graph);
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'RangeError',
      message: 'Maximum call stack size exceeded',
    });
    const worker = latestWorker();
    worker.listener?.({
      data: {
        id: worker.requests[0].id,
        error: { name: 'RangeError', message: 'Maximum call stack size exceeded' },
      },
    } as MessageEvent<ElkLayoutResponse>);
    await rejected;

    const next = elk.layout(graph);
    worker.reply(worker.requests.at(-1)!.graph);
    await expect(next).resolves.toEqual(graph);
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(TestWorker.instances).toHaveLength(1);
    elk.terminateWorker();
  });

  it.each(['error', 'messageerror'] as const)(
    'settles every request after a worker %s without a legacy fallback',
    async (kind) => {
      const elk = createElkWorkerClient();
      const first = elk.layout(graph);
      const second = elk.layout(graph);
      const rejected = Promise.all([
        expect(first).rejects.toThrow(),
        expect(second).rejects.toThrow(),
      ]);
      const worker = latestWorker();
      if (kind === 'error') {
        worker.onerror?.({ message: 'WASM failed to load' } as ErrorEvent);
      } else {
        worker.onmessageerror?.();
      }
      await rejected;
      await expect(elk.layout(graph)).rejects.toThrow();
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(TestWorker.instances).toHaveLength(1);
      expect(createElk).not.toHaveBeenCalled();
      expect(layout).not.toHaveBeenCalled();
    }
  );

  it.each(['constructor', 'postMessage'] as const)(
    'rejects through its Promise contract when worker %s throws',
    async (stage) => {
      vi.stubGlobal(
        'Worker',
        class extends TestWorker {
          constructor(url: URL, options: WorkerOptions) {
            super(url, options);
            if (stage === 'constructor') throw new Error('Worker unavailable');
            this.postMessage.mockImplementation(() => {
              throw new Error('Cannot clone graph');
            });
          }
        }
      );
      const elk = createElkWorkerClient();
      await expect(elk.layout(graph)).rejects.toThrow(
        stage === 'constructor' ? 'Worker unavailable' : 'Cannot clone graph'
      );
      expect(layout).not.toHaveBeenCalled();
      expect(TestWorker.instances).toHaveLength(1);
    }
  );

  it('rejects all pending jobs on termination and ignores late worker events', async () => {
    const elk = createElkWorkerClient();
    const first = elk.layout(graph);
    const second = elk.layout(graph);
    const rejected = Promise.all([
      expect(first).rejects.toThrow('terminated'),
      expect(second).rejects.toThrow('terminated'),
    ]);
    const worker = latestWorker();
    elk.terminateWorker();
    elk.terminateWorker();
    await rejected;
    worker.reply(graph);
    worker.onerror?.({ message: 'Late error' } as ErrorEvent);
    await expect(elk.layout(graph)).rejects.toThrow('terminated');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(TestWorker.instances).toHaveLength(1);
  });

  it('does not create a worker when terminated before its first layout', async () => {
    const elk = createElkWorkerClient();
    elk.terminateWorker();
    await expect(elk.layout(graph)).rejects.toThrow('terminated');
    expect(TestWorker.instances).toHaveLength(0);
  });

  it('loads and reuses one engine when Worker is unavailable', async () => {
    vi.stubGlobal('Worker', undefined);
    layout.mockResolvedValue(graph);
    const elk = createElkWorkerClient();
    expect(createElk).not.toHaveBeenCalled();
    const first = elk.layout(graph);
    const second = elk.layout(graph);
    await expect(first).resolves.toEqual(graph);
    await expect(second).resolves.toEqual(graph);
    await expect(elk.layout(graph)).resolves.toEqual(graph);
    expect(createElk).toHaveBeenCalledOnce();
    expect(layout).toHaveBeenCalledTimes(3);
    expect(layout.mock.calls[0][0].children[0].id).not.toBe('q0');
    elk.terminateWorker();
  });

  it('passes the output option through the no-worker backend', async () => {
    vi.stubGlobal('Worker', undefined);
    layout.mockImplementation(async (input) => ({
      id: input.id,
      children: input.children.map(
        ({ id, width, height }: { id: string; width: number; height: number }) => ({
          id,
          width,
          height,
          x: 12,
          y: 24,
        })
      ),
    }));
    const elk = createElkWorkerClient('positions-layout', { positionsOnly: true });
    await expect(elk.layout(graph)).resolves.toEqual({
      id: 'root',
      children: [{ id: 'q0', width: 50, height: 50, x: 12, y: 24 }],
    });
    expect(createElk).toHaveBeenCalledWith({ positionsOnly: true });
    elk.terminateWorker();
  });

  it('does not initialize or dispatch a no-worker layout terminated during import', async () => {
    vi.stubGlobal('Worker', undefined);
    const elk = createElkWorkerClient();
    const pending = elk.layout(graph);
    const rejected = expect(pending).rejects.toThrow('terminated');
    elk.terminateWorker();
    await rejected;
    // Await the same import so its continuation has had a chance to run.
    await import('../src/components/shared/layout/elkBackend');
    await Promise.resolve();
    expect(createElk).not.toHaveBeenCalled();
    expect(layout).not.toHaveBeenCalled();
  });

  it('settles terminated no-worker jobs even if the engine never finishes', async () => {
    vi.stubGlobal('Worker', undefined);
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    layout.mockImplementation(() => {
      markStarted();
      return new Promise(() => {});
    });
    const elk = createElkWorkerClient();
    const pending = elk.layout(graph);
    const rejected = expect(pending).rejects.toThrow('terminated');
    await started;
    elk.terminateWorker();
    await rejected;
  });

  it.each(['constructor', 'layout'] as const)(
    'turns a synchronous no-worker %s failure into a rejected Promise',
    async (stage) => {
      vi.stubGlobal('Worker', undefined);
      (stage === 'constructor' ? createElk : layout).mockImplementation(() => {
        throw new TypeError('Invalid fallback');
      });
      const elk = createElkWorkerClient();
      await expect(elk.layout(graph)).rejects.toMatchObject({
        name: 'TypeError',
        message: 'Invalid fallback',
      });
      elk.terminateWorker();
    }
  );
});
