// src/zustands/GraphZustand.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import {
  ConfigNodeMode,
  DEFAULT_ELK_OPTS,
  DEFAULT_GRAPH_NODES_ELK_OPTS,
  DEFAULT_CONFIG_GRAPH_TARGET_NODES,
  DEFAULT_TREE_DEPTH,
} from '@utils/constants';
import type { ElkOptions } from '@mytypes/graphTypes';

type Updater<T> = T | ((prev: T) => T);
type PartialUpdater<T> = Partial<T> | ((prev: T) => Partial<T>);

interface GraphZustandState {
  // Node display modes for config graph and computation tree
  configGraphNodeMode: ConfigNodeMode;
  computationTreeNodeMode: ConfigNodeMode;

  // ELK settings for config graph, TM graph, and computation tree
  tmGraphELKSettings: ElkOptions;
  configGraphELKSettings: ElkOptions;
  computationTreeELKSettings: ElkOptions;

  // Other
  computationTreeDepth: number;
  configGraphTargetNodes: number;
}

interface GraphZustandActions {
  // Node display modes
  setConfigGraphNodeMode: (mode: Updater<ConfigNodeMode>) => void;
  setComputationTreeNodeMode: (mode: Updater<ConfigNodeMode>) => void;

  // ELK settings (patch instead of set)
  setTMGraphELKSettings: (patch: PartialUpdater<ElkOptions>) => void;
  setConfigGraphELKSettings: (patch: PartialUpdater<ElkOptions>) => void;
  setComputationTreeELKSettings: (patch: PartialUpdater<ElkOptions>) => void;

  // Other
  setComputationTreeDepth: (depth: Updater<number>) => void;
  setConfigGraphTargetNodes: (nodes: Updater<number>) => void;

  // Utilities
  reset: () => void;
}

export type GraphZustand = GraphZustandState & GraphZustandActions;

const createInitialState = (): GraphZustandState => ({
  configGraphNodeMode: ConfigNodeMode.NODES,
  computationTreeNodeMode: ConfigNodeMode.NODES,

  tmGraphELKSettings: { ...DEFAULT_ELK_OPTS },
  configGraphELKSettings: { ...DEFAULT_GRAPH_NODES_ELK_OPTS },
  computationTreeELKSettings: { ...DEFAULT_GRAPH_NODES_ELK_OPTS },

  computationTreeDepth: DEFAULT_TREE_DEPTH,
  configGraphTargetNodes: DEFAULT_CONFIG_GRAPH_TARGET_NODES,
});

/**
 * Zustand store for graph layout settings node modes and computation tree depth.
 */
function resolve<T>(update: Updater<T>, previous: T): T {
  return typeof update === 'function'
    ? (update as (value: T) => T)(previous)
    : update;
}

export const useGraphZustand = create<GraphZustand>()(
  subscribeWithSelector((set) => {
    const update =
      <Key extends keyof GraphZustandState>(key: Key) =>
      (value: Updater<GraphZustandState[Key]>) =>
        set((state) => ({ [key]: resolve(value, state[key]) }));
    const patch =
      (
        key:
          | 'tmGraphELKSettings'
          | 'configGraphELKSettings'
          | 'computationTreeELKSettings'
      ) =>
      (value: PartialUpdater<ElkOptions>) =>
        set((state) => ({
          [key]: {
            ...state[key],
            ...(typeof value === 'function' ? value(state[key]) : value),
          },
        }));

    return {
      ...createInitialState(),
      setConfigGraphNodeMode: update('configGraphNodeMode'),
      setComputationTreeNodeMode: update('computationTreeNodeMode'),
      setTMGraphELKSettings: patch('tmGraphELKSettings'),
      setConfigGraphELKSettings: patch('configGraphELKSettings'),
      setComputationTreeELKSettings: patch('computationTreeELKSettings'),
      setComputationTreeDepth: update('computationTreeDepth'),
      setConfigGraphTargetNodes: update('configGraphTargetNodes'),
      reset: () => set(createInitialState()),
    };
  })
);

// Selectors for usage in components
export const useConfigGraphNodeMode = () =>
  useGraphZustand((s) => s.configGraphNodeMode);
export const useComputationTreeNodeMode = () =>
  useGraphZustand((s) => s.computationTreeNodeMode);

export const useTMGraphELKSettings = () =>
  useGraphZustand((s) => s.tmGraphELKSettings);
export const useConfigGraphELKSettings = () =>
  useGraphZustand((s) => s.configGraphELKSettings);
export const useComputationTreeELKSettings = () =>
  useGraphZustand((s) => s.computationTreeELKSettings);

export const useComputationTreeDepth = () =>
  useGraphZustand((s) => s.computationTreeDepth);

export const useConfigGraphTargetNodes = () =>
  useGraphZustand((s) => s.configGraphTargetNodes);
