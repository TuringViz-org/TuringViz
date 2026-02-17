// src/zustands/GraphZustand.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { subscribeWithSelector } from 'zustand/middleware';

import {
  ConfigNodeMode,
  DEFAULT_ELK_OPTS,
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

const initialState: GraphZustandState = {
  configGraphNodeMode: ConfigNodeMode.CIRCLES,
  computationTreeNodeMode: ConfigNodeMode.CIRCLES,

  tmGraphELKSettings: { ...DEFAULT_ELK_OPTS, direction: 'RIGHT' },
  configGraphELKSettings: { ...DEFAULT_ELK_OPTS },
  computationTreeELKSettings: { ...DEFAULT_ELK_OPTS },

  computationTreeDepth: DEFAULT_TREE_DEPTH,
  configGraphTargetNodes: DEFAULT_CONFIG_GRAPH_TARGET_NODES,
};

/**
 * Zustand store for graph layout settings node modes and computation tree depth.
 */
export const useGraphZustand = create<GraphZustand>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // Node display modes
    setConfigGraphNodeMode: (mode) =>
      set(
        (s) => ({
          configGraphNodeMode:
            typeof mode === 'function'
              ? (mode as (prev: ConfigNodeMode) => ConfigNodeMode)(
                  s.configGraphNodeMode
                )
              : mode,
        }),
        false
      ),

    setComputationTreeNodeMode: (mode) =>
      set(
        (s) => ({
          computationTreeNodeMode:
            typeof mode === 'function'
              ? (mode as (prev: ConfigNodeMode) => ConfigNodeMode)(
                  s.computationTreeNodeMode
                )
              : mode,
        }),
        false
      ),

    // ELK settings (patch instead of set)
    setTMGraphELKSettings: (patch) =>
      set((s) => {
        const p = typeof patch === 'function' ? patch(s.tmGraphELKSettings) : patch;
        return { tmGraphELKSettings: { ...s.tmGraphELKSettings, ...p } };
      }, false),

    setConfigGraphELKSettings: (patch) =>
      set((s) => {
        const p =
          typeof patch === 'function' ? patch(s.configGraphELKSettings) : patch;
        return { configGraphELKSettings: { ...s.configGraphELKSettings, ...p } };
      }, false),

    setComputationTreeELKSettings: (patch) =>
      set((s) => {
        const p =
          typeof patch === 'function' ? patch(s.computationTreeELKSettings) : patch;
        return {
          computationTreeELKSettings: { ...s.computationTreeELKSettings, ...p },
        };
      }, false),

    // Other
    setComputationTreeDepth: (depth) =>
      set(
        (s) => ({
          computationTreeDepth:
            typeof depth === 'function'
              ? (depth as (prev: number) => number)(s.computationTreeDepth)
              : depth,
        }),
        false
      ),

    setConfigGraphTargetNodes: (nodes) =>
      set(
        (s) => ({
          configGraphTargetNodes:
            typeof nodes === 'function'
              ? (nodes as (prev: number) => number)(s.configGraphTargetNodes)
              : nodes,
        }),
        false
      ),

    // Utilities
    reset: () => set(() => ({ ...initialState }), false),
  }))
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
