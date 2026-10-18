import type { useComputationTreeData } from './useComputationTreeData';

export type Props = {
  targetNodes: number;
  compressing?: boolean;
  paused?: boolean;
  active?: boolean;
};
type ComputationTreeData = ReturnType<typeof useComputationTreeData>;
export type ViewProps = Props & { treeData: ComputationTreeData };
