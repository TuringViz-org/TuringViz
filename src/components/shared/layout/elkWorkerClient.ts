import type { ElkNode } from '@openedges/elk-layout';
import { isLegacyElkGraph } from './elkAlgorithms';
import { compactElkGraph } from './elkCompactGraph';
import type {
  ElkLayoutRequest,
  ElkLayoutResponse,
  ElkLayoutOutputOptions,
} from '../../../workers/elkLayoutProtocol';

export type { ElkLayoutOutputOptions } from '../../../workers/elkLayoutProtocol';

export interface ElkLayoutEngine {
  layout(graph: ElkNode): Promise<ElkNode>;
  terminateWorker(): void;
}

type WorkerKind = 'wasm' | 'legacy';
type LegacyLayoutResponse = {
  id: number;
  data?: ElkNode;
  error?: unknown;
};

function layoutError(error: unknown): Error {
  if (error instanceof Error) return error;
  const details = error as { name?: string; message?: string } | null;
  const result = new Error(details?.message || String(error));
  result.name = details?.name || 'Error';
  return result;
}

/** Keep layout work off the browser's main thread. */
export function createElkWorkerClient(
  workerName = 'elk-layout-worker',
  { positionsOnly = false }: ElkLayoutOutputOptions = {}
): ElkLayoutEngine {
  type Pending = {
    kind: WorkerKind;
    graph: ElkNode;
    restore?: (result: ElkNode) => ElkNode;
    resolve: (graph: ElkNode) => void;
    reject: (error: unknown) => void;
  };
  const pending = new Map<number, Pending>();
  const workers = new Map<WorkerKind, Worker>();
  let sequence = 0;
  let stopped: Error | undefined;
  let fallback: Promise<Pick<ElkLayoutEngine, 'layout'>> | undefined;

  function stop(error: Error) {
    if (stopped) return;
    stopped = error;
    for (const worker of workers.values()) worker.terminate();
    workers.clear();
    for (const job of pending.values()) job.reject(error);
    pending.clear();
  }

  function resolve(id: number, result: ElkNode) {
    const job = pending.get(id);
    if (!job) return;
    const restored = job.restore ? job.restore(result) : result;
    pending.delete(id);
    job.resolve(restored);
  }

  function reject(id: number, error: unknown) {
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    job.reject(error);
  }

  async function layoutWithoutWorker(id: number, graph: ElkNode) {
    try {
      fallback ??= import('./elkBackend').then(({ createElkBackend }) => {
        if (stopped) throw stopped;
        return createElkBackend({ positionsOnly });
      });
      const elk = await fallback;
      // Termination also cancels jobs waiting for the module to initialize.
      if (!pending.has(id)) return;
      resolve(id, await elk.layout(graph));
    } catch (error) {
      reject(id, error);
    }
  }

  function dispatch(id: number) {
    const job = pending.get(id);
    if (stopped || !job) return;
    const { kind, graph } = job;

    try {
      let payload = graph;
      if (kind === 'wasm') {
        const compact = compactElkGraph(graph);
        payload = compact.graph;
        job.restore = compact.restore;
      }
      let worker = workers.get(kind);
      if (!worker) {
        // ELK.js must execute as a classic worker: importing its bundled fake
        // worker inside a module worker overwrites that worker's message handler.
        const created =
          kind === 'legacy'
            ? new Worker(new URL('elkjs/lib/elk-worker.js', import.meta.url), {
                name: `${workerName}-legacy`,
              })
            : new Worker(
                new URL('../../../workers/elkLayout.worker.ts', import.meta.url),
                { type: 'module', name: workerName }
              );
        worker = created;
        workers.set(kind, created);
        created.addEventListener(
          'message',
          (event: MessageEvent<ElkLayoutResponse | LegacyLayoutResponse>) => {
            if (workers.get(kind) !== created) return;
            const message = event.data;
            if (!message) return;
            if (kind === 'legacy' && message.id === 0) {
              if ('error' in message) {
                stop(layoutError(message.error));
              }
              return;
            }
            if (pending.get(message.id)?.kind !== kind) return;
            try {
              if ('error' in message) {
                reject(message.id, layoutError(message.error));
              } else if ('result' in message) {
                resolve(message.id, message.result);
              } else if ('data' in message && message.data) {
                resolve(message.id, message.data);
              }
            } catch (error) {
              stop(layoutError(error));
            }
          }
        );
        created.onerror = (event) => {
          if (workers.get(kind) !== created) return;
          stop(new Error(event.message || 'ELK layout worker failed'));
        };
        created.onmessageerror = () => {
          if (workers.get(kind) !== created) return;
          stop(new Error('ELK layout worker returned an unreadable message'));
        };
        if (kind === 'legacy') {
          // Worker messages are processed in order, so registration precedes
          // every layout even while the worker script is still loading.
          created.postMessage({
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
          });
        }
      }
      if (stopped || !pending.has(id)) return;
      if (kind === 'legacy') {
        worker.postMessage({
          id,
          cmd: 'layout',
          graph,
          layoutOptions: {},
          options: { logging: false, measureExecutionTime: false },
        });
      } else {
        worker.postMessage({
          id,
          graph: payload,
          ...(positionsOnly && { positionsOnly: true }),
        } satisfies ElkLayoutRequest);
      }
    } catch (error) {
      stop(layoutError(error));
    }
  }

  function layout(graph: ElkNode): Promise<ElkNode> {
    if (stopped) return Promise.reject(stopped);

    return new Promise((resolveJob, rejectJob) => {
      const id = ++sequence;
      const kind = isLegacyElkGraph(graph) ? 'legacy' : 'wasm';
      pending.set(id, {
        kind,
        graph,
        resolve: resolveJob,
        reject: rejectJob,
      });

      if (typeof Worker === 'undefined') {
        void layoutWithoutWorker(id, graph);
        return;
      }

      dispatch(id);
    });
  }

  return {
    layout,
    terminateWorker: () => {
      stop(new Error('ELK layout worker was terminated'));
    },
  };
}
