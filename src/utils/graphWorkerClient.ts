import type { Configuration, Transition } from '@mytypes/TMTypes';
import type { ComputationTree } from '@tmfunctions/ComputationTree';
import { getComputationTreeFromInputs } from '@tmfunctions/ComputationTree';
import type { ConfigGraph } from '@tmfunctions/ConfigGraph';
import { computeConfigGraph } from '@tmfunctions/ConfigGraph';

type TreePayload = {
  depth: number;
  compressing?: boolean;
  transitions: Map<string, Transition[]>;
  numberOfTapes: number;
  blank: string;
  startConfig: Configuration;
};

type ConfigGraphPayload = {
  startConfig: Configuration;
  transitions: Map<string, Transition[]>;
  numberOfTapes: number;
  blank: string;
  targetNodes?: number;
};

type WorkerMessage =
  | { id: number; type: 'computationTree'; tree: ComputationTree }
  | { id: number; type: 'configGraph'; graph: ConfigGraph };

let treeWorker: Worker | null = null;
let treeSeq = 0;
const treePending = new Map<
  number,
  { resolve: (v: ComputationTree) => void; reject: (e: unknown) => void }
>();

let configWorker: Worker | null = null;
let configSeq = 0;
const configPending = new Map<
  number,
  { resolve: (v: ConfigGraph) => void; reject: (e: unknown) => void }
>();

function terminateTreeWorker() {
  treeWorker?.terminate();
  treeWorker = null;
  for (const [, { reject }] of treePending) reject(new Error('Tree worker reset'));
  treePending.clear();
}

function terminateConfigWorker() {
  configWorker?.terminate();
  configWorker = null;
  for (const [, { reject }] of configPending)
    reject(new Error('Config worker reset'));
  configPending.clear();
}

function ensureTreeWorker(): Worker {
  if (!treeWorker) {
    treeWorker = new Worker(new URL('../workers/graphCompute.worker.ts', import.meta.url), {
      type: 'module',
      name: 'graph-compute-tree',
    });
    treeWorker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;
      if (msg.type !== 'computationTree') return;
      const pending = treePending.get(msg.id);
      if (!pending) return;
      treePending.delete(msg.id);
      pending.resolve(msg.tree);
    });
    treeWorker.addEventListener('error', (err) => {
      for (const [, { reject }] of treePending) reject(err);
      treePending.clear();
    });
  }
  return treeWorker;
}

function ensureConfigWorker(): Worker {
  if (!configWorker) {
    configWorker = new Worker(new URL('../workers/graphCompute.worker.ts', import.meta.url), {
      type: 'module',
      name: 'graph-compute-config',
    });
    configWorker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;
      if (msg.type !== 'configGraph') return;
      const pending = configPending.get(msg.id);
      if (!pending) return;
      configPending.delete(msg.id);
      pending.resolve(msg.graph);
    });
    configWorker.addEventListener('error', (err) => {
      for (const [, { reject }] of configPending) reject(err);
      configPending.clear();
    });
  }
  return configWorker;
}

export function computeComputationTreeInWorker(
  payload: TreePayload
): Promise<ComputationTree> {
  // Fallback to synchronous computation if workers are unavailable
  if (typeof Worker === 'undefined') {
    return Promise.resolve(
      getComputationTreeFromInputs(
        payload.startConfig,
        payload.transitions,
        payload.numberOfTapes,
        payload.blank,
        payload.depth,
        !!payload.compressing
      )
    );
  }

  // Cancel any ongoing job (avoid stale work on example switch)
  terminateTreeWorker();
  const worker = ensureTreeWorker();
  const id = ++treeSeq;

  return new Promise<ComputationTree>((resolve, reject) => {
    treePending.set(id, { resolve, reject });
    worker.postMessage({ id, type: 'computationTree', payload });
  });
}

export function computeConfigGraphInWorker(
  payload: ConfigGraphPayload
): Promise<ConfigGraph> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(
      computeConfigGraph(
        payload.startConfig,
        payload.targetNodes ?? 2000,
        payload.transitions,
        payload.numberOfTapes,
        payload.blank
      )
    );
  }

  // Cancel any ongoing job (avoid stale work on example switch)
  terminateConfigWorker();
  const worker = ensureConfigWorker();
  const id = ++configSeq;

  return new Promise<ConfigGraph>((resolve, reject) => {
    configPending.set(id, { resolve, reject });
    worker.postMessage({ id, type: 'configGraph', payload });
  });
}
