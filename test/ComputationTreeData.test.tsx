import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useComputationTreeData } from '@components/ComputationTree/ComputationTree';
import { buildComputationTreeGraph } from '@components/ComputationTree/util/buildComputationTree';
import { computeComputationTreeInWorker } from '@utils/graphWorkerClient';
import { End, type ComputationTree } from '@tmfunctions/ComputationTree';
import { ConfigNodeMode } from '@utils/constants';
import { useGlobalZustand } from '@zustands/GlobalZustand';

vi.mock('@utils/graphWorkerClient', () => ({
  computeComputationTreeInWorker: vi.fn(),
  cancelComputationTreeCompute: vi.fn(),
}));
vi.mock(
  '@components/ComputationTree/util/buildComputationTree',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@components/ComputationTree/util/buildComputationTree')
      >();
    return {
      ...actual,
      buildComputationTreeGraph: vi.fn(actual.buildComputationTreeGraph),
    };
  }
);

const nodes = [0, 1].map((id) => ({
  id,
  config: { state: `q${id}`, tapes: [[[], []]] as [[], []][], heads: [0] },
  end: End.None,
}));
const tree: ComputationTree = {
  root: nodes[0],
  nodes,
  edges: [{ from: 0, to: 1, transitionIndex: 0, compressed: false }],
};

describe('retained computation tree data', () => {
  beforeEach(() => {
    useGlobalZustand.getState().reset();
    useGlobalZustand.getState().setCurrentState('q0');
    vi.mocked(computeComputationTreeInWorker).mockReset();
    vi.mocked(buildComputationTreeGraph).mockClear();
  });
  afterEach(cleanup);

  it('reuses the model and graph structure across run steps and tab switches', async () => {
    vi.mocked(computeComputationTreeInWorker).mockResolvedValue(tree);
    const view = renderHook(
      ({ active }) =>
        useComputationTreeData(17000, false, ConfigNodeMode.NODES, false, active),
      { initialProps: { active: true } }
    );
    await waitFor(() => expect(view.result.current.model).toBe(tree));
    const edges = view.result.current.base.edges;
    expect(view.result.current.base.nodes[0].data.isCurrent).toBe(true);

    act(() => {
      useGlobalZustand.getState().setCurrentState('q1');
    });
    expect(view.result.current.base.nodes[0].data.isCurrent).toBe(false);
    expect(view.result.current.base.nodes[1].data.isCurrent).toBe(true);

    view.rerender({ active: false });
    const hidden = view.result.current.base;
    act(() => {
      for (let i = 0; i < 100; i++)
        useGlobalZustand.getState().setCurrentState(`q${i}`);
      useGlobalZustand.getState().setCurrentState('q0');
    });
    expect(view.result.current.base).toBe(hidden);
    view.rerender({ active: true });
    expect(view.result.current.base.nodes[0].data.isCurrent).toBe(true);
    expect(view.result.current.base.edges).toBe(edges);
    expect(computeComputationTreeInWorker).toHaveBeenCalledOnce();
    expect(buildComputationTreeGraph).toHaveBeenCalledOnce();
  });

  it('does not restart an in-flight computation when switching tabs', async () => {
    let finish!: (result: ComputationTree) => void;
    vi.mocked(computeComputationTreeInWorker).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const view = renderHook(
      ({ active }) =>
        useComputationTreeData(17000, false, ConfigNodeMode.NODES, false, active),
      { initialProps: { active: true } }
    );
    view.rerender({ active: false });
    await act(async () => {
      finish(tree);
    });
    view.rerender({ active: true });
    expect(view.result.current.model).toBe(tree);
    expect(computeComputationTreeInWorker).toHaveBeenCalledOnce();
    expect(buildComputationTreeGraph).toHaveBeenCalledOnce();
  });
});
