import type { ElkNode } from '@openedges/elk-layout';
import {
  createElkWorkerClient,
  type ElkLayoutEngine,
  type ElkLayoutOutputOptions,
} from './elkWorkerClient';

export type ElkAlgo = 'layered' | 'force' | 'mrtree' | 'stress' | 'radial';

export function resolveElkAlgorithm(algorithm: ElkAlgo): string {
  switch (algorithm) {
    case 'layered':
      return 'layered';
    case 'radial':
      return 'radial';
    case 'mrtree':
      return 'mrtree';
    case 'stress':
      return 'stress';
    default:
      return 'force';
  }
}

export function createElkWithWorker(
  workerName = 'elk-layout-worker',
  options: ElkLayoutOutputOptions = {}
) {
  return createElkWorkerClient(workerName, options);
}

export async function runElkLayoutWithTimeout(
  elk: ElkLayoutEngine,
  graph: ElkNode,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<ElkNode> {
  const aborted = () => new DOMException('ELK layout was cancelled', 'AbortError');
  if (signal?.aborted) throw aborted();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const deadline = new Promise<ElkNode>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`ELK layout timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      onAbort = () => reject(aborted());
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    return await Promise.race([elk.layout(graph), deadline]);
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}
