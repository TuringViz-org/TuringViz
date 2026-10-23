// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unpackConfigGraph } from '../src/workers/configGraphCodec';
import type { GraphComputeRequest } from '../src/workers/graphComputeProtocol';

const { computeConfig, computeTree } = vi.hoisted(() => ({
  computeConfig: vi.fn(),
  computeTree: vi.fn(),
}));
vi.mock('../src/workers/graphComputeProtocol', () => ({
  graphComputations: { configGraph: computeConfig, computationTree: computeTree },
}));

const workerScope = { onmessage: (_event: MessageEvent<GraphComputeRequest>) => {} };
const post = vi.fn();
const payload = {
  startConfig: { state: 'start', tapes: [[[], [{ value: '_' }]]], heads: [0] },
  transitions: new Map(),
  numberOfTapes: 1,
  blank: '_',
};
function resultGraph() {
  const config = structuredClone(payload.startConfig);
  return {
    startconfig: config,
    startconfighash: 'root',
    Graph: new Map([['root', { config, computed: true, next: [] }]]),
  };
}
function request(type: 'configGraph' | 'computationTree') {
  workerScope.onmessage({
    data: { id: 7, type, payload },
  } as MessageEvent<GraphComputeRequest>);
}

describe('graph computation worker transport', () => {
  beforeEach(async () => {
    vi.resetModules();
    computeConfig.mockReset();
    computeTree.mockReset();
    post.mockReset();
    vi.stubGlobal('self', workerScope);
    vi.stubGlobal('postMessage', post);
    await import('../src/workers/graphCompute.worker');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('transfers fresh compact config buffers without detaching the computed graph', () => {
    const result = resultGraph();
    const snapshot = structuredClone(result);
    computeConfig.mockReturnValue(result);
    request('configGraph');
    const [message, options] = post.mock.calls[0];
    expect(message).toMatchObject({
      id: 7,
      type: 'configGraph',
      result: { format: 'config-graph-v1' },
    });
    expect(options.transfer).toHaveLength(4);
    const delivered = structuredClone(message, options);
    expect(unpackConfigGraph(delivered.result)).toEqual(result);
    expect(result).toEqual(snapshot);
    expect(
      options.transfer.every((buffer: ArrayBuffer) => buffer.byteLength === 0)
    ).toBe(true);
  });

  it('retains the full result when extra data prevents compact encoding', () => {
    const result = resultGraph();
    Object.assign(result.startconfig, { metadata: 'keep' });
    computeConfig.mockReturnValue(result);
    request('configGraph');
    expect(post).toHaveBeenCalledWith(
      { id: 7, type: 'configGraph', result },
      { transfer: [] }
    );
  });

  it('leaves computation-tree messages unchanged', () => {
    const result = { tree: 'unchanged' };
    computeTree.mockReturnValue(result);
    request('computationTree');
    expect(post).toHaveBeenCalledWith({ id: 7, type: 'computationTree', result });
    expect(computeConfig).not.toHaveBeenCalled();
  });

  it('preserves explicit computation errors', () => {
    computeConfig.mockImplementation(() => {
      throw new TypeError('Invalid machine');
    });
    request('configGraph');
    expect(post).toHaveBeenCalledWith({
      id: 7,
      type: 'configGraph',
      error: { name: 'TypeError', message: 'Invalid machine' },
    });
  });
});
