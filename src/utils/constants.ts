// src/utils/constants.ts
import type { ElkOptions } from '@mytypes/graphTypes';

export enum ConfigNodeMode {
  CIRCLES = 'circles',
  CARDS = 'cards',
}
// Default settings for computation tree layout
export const DEFAULT_ELK_OPTS: ElkOptions = {
  algorithm: 'layered',
  direction: 'DOWN',
  nodeSep: 70,
  rankSep: 100,
  edgeSep: 24,
  edgeNodeSep: 100,
  padding: 24,
};

// Computation tree node-budget controls.
// NOTE: DEFAULT_TREE_DEPTH is kept for backwards compatibility with existing imports.
export const MIN_COMPUTATION_TREE_TARGET_NODES = 30;
export const MAX_COMPUTATION_TREE_TARGET_NODES = 100000;
export const DEFAULT_TREE_DEPTH = 20000;

// Minimum/Default target node count for configuration graph computation
export const MIN_CONFIG_GRAPH_TARGET_NODES = 30;
export const MAX_CONFIG_GRAPH_TARGET_NODES = 100000;

// Default target node count for configuration graph computation
export const DEFAULT_CONFIG_GRAPH_TARGET_NODES = 20000;

// Delay before showing hover poppers (in ms)
export const HOVER_POPPER_DELAY_MS = 500;

// Threshold where switching to card view should be confirmed
export const CARDS_CONFIRM_THRESHOLD = 30;
