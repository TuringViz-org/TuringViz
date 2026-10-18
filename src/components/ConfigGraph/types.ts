import type { Configuration, Transition } from '@mytypes/TMTypes';

/** Data shared by configuration graphs and computation trees. */
export interface ConfigNodeData extends Record<string, unknown> {
  label?: string;
  config?: Configuration;
  isStart?: boolean;
  isCurrent?: boolean;
  isComputed?: boolean;
  isSelectable?: boolean;
  showLabel?: boolean;
  stateColor?: string;
  pendingInteractive?: boolean;
}

/** Rendered nodes always have a configuration and their display identity. */
export type ConfigNodeRenderData = ConfigNodeData & {
  label: string;
  config: Configuration;
  isStart: boolean;
  isCurrent: boolean;
};

export interface ConfigEdgeData extends Record<string, unknown> {
  transition?: Transition;
  bended?: boolean;
  bendDirection?: 'up' | 'down';
  compressed?: boolean;
  compressedLength?: number;
  tooltipLines?: string[];
  highlighted?: boolean;
}
