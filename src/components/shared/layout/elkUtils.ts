import Elk from 'elkjs/lib/elk.bundled.js';

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
