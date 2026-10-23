import { isPackedConfigGraph, unpackConfigGraph } from '../workers/configGraphCodec';
import {
  graphComputations,
  type GraphComputeKind,
  type GraphComputePayloads,
  type GraphComputeResponse,
  type GraphComputeResults,
  type GraphComputeWireResults,
} from '../workers/graphComputeProtocol';

const WORKER_TIMEOUT_MS = 4500;

export class GraphComputeCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphComputeCancelledError';
  }
}

export function isGraphComputeCancelled(error: unknown): boolean {
  return error instanceof GraphComputeCancelledError;
}

/**
 * One independently cancellable channel per graph kind. A newer request replaces
 * unfinished work; visibility and tab changes never participate in this lifecycle.
 */
function createComputeChannel<Kind extends GraphComputeKind>(
  type: Kind,
  name: string,
  resetMessage: string,
  compute: (payload: GraphComputePayloads[Kind]) => GraphComputeResults[Kind],
  decode: (result: GraphComputeWireResults[Kind]) => GraphComputeResults[Kind]
) {
  type Pending = {
    id: number;
    resolve: (value: GraphComputeResults[Kind]) => void;
    reject: (error: unknown) => void;
    timer?: ReturnType<typeof setTimeout>;
    recover: () => void;
  };
  let worker: Worker | null = null;
  let pending: Pending | null = null;
  let sequence = 0;

  function terminate() {
    worker?.terminate();
    worker = null;
  }

  function take(job: Pending) {
    if (pending !== job) return false;
    clearTimeout(job.timer);
    pending = null;
    return true;
  }

  function cancel() {
    const job = pending;
    terminate();
    if (job && take(job)) job.reject(new GraphComputeCancelledError(resetMessage));
  }

  function run(
    payload: GraphComputePayloads[Kind]
  ): Promise<GraphComputeResults[Kind]> {
    if (pending) cancel();

    return new Promise((resolve, reject) => {
      const job: Pending = {
        id: ++sequence,
        resolve,
        reject,
        recover: () => fallback(),
      };
      pending = job;

      const fallback = () => {
        if (pending !== job) return;
        terminate();
        if (!take(job)) return;
        try {
          resolve(compute(payload));
        } catch (error) {
          reject(error);
        }
      };

      if (typeof Worker === 'undefined') {
        // Preserve the Promise contract for thrown computation errors, and allow
        // a synchronous reset/new request to invalidate this fallback first.
        queueMicrotask(fallback);
        return;
      }

      try {
        if (!worker) {
          const created = new Worker(
            new URL('../workers/graphCompute.worker.ts', import.meta.url),
            { type: 'module', name }
          );
          worker = created;
          created.addEventListener(
            'message',
            (event: MessageEvent<GraphComputeResponse<Kind>>) => {
              const message = event.data;
              const current = pending;
              if (
                worker !== created ||
                !current ||
                message.type !== type ||
                message.id !== current.id
              )
                return;
              if ('error' in message) {
                const reported = message.error;
                if (
                  !reported ||
                  typeof reported.name !== 'string' ||
                  typeof reported.message !== 'string'
                ) {
                  current.recover();
                  return;
                }
                const error = new Error(reported.message);
                error.name = reported.name;
                if (take(current)) current.reject(error);
              } else {
                try {
                  const result = decode(message.result);
                  if (take(current)) current.resolve(result);
                } catch {
                  // A malformed response is a transport failure, like a clone
                  // error. Retry the same pure computation through the fallback.
                  current.recover();
                }
              }
            }
          );
        }

        // These callbacks belong to this request, including when an idle worker
        // is reused. A stale worker event can never settle a replacement job.
        const currentWorker = worker;
        const onFailure = () => {
          if (worker !== currentWorker) return;
          if (pending === job) fallback();
          else if (!pending) terminate();
        };
        currentWorker.onerror = onFailure;
        currentWorker.onmessageerror = onFailure;
        job.timer = setTimeout(fallback, WORKER_TIMEOUT_MS);
        currentWorker.postMessage({ id: job.id, type, payload });
      } catch {
        fallback();
      }
    });
  }

  return { run, cancel };
}

const treeChannel = createComputeChannel(
  'computationTree',
  'graph-compute-tree',
  'Tree worker reset',
  graphComputations.computationTree,
  (result) => result
);
const configChannel = createComputeChannel(
  'configGraph',
  'graph-compute-config',
  'Config worker reset',
  graphComputations.configGraph,
  (result) => (isPackedConfigGraph(result) ? unpackConfigGraph(result) : result)
);

export const computeComputationTreeInWorker = treeChannel.run;
export const cancelComputationTreeCompute = treeChannel.cancel;
export const computeConfigGraphInWorker = configChannel.run;
export const cancelConfigGraphCompute = configChannel.cancel;
