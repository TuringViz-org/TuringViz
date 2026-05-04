import Elk, { type ElkNode } from 'elkjs/lib/elk-api.js';

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

export function createElkWithWorker(workerName = 'elk-layout-worker') {
  if (typeof Worker === 'undefined') return new Elk();

  return new Elk({
    workerFactory: () =>
      new Worker(new URL('elkjs/lib/elk-worker.js', import.meta.url), {
        name: workerName,
      }),
  });
}

export async function runElkLayoutWithTimeout(
  elk: InstanceType<typeof Elk>,
  graph: ElkNode,
  timeoutMs: number
): Promise<ElkNode> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      elk.layout(graph),
      new Promise<ElkNode>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`ELK layout timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
  }
}
