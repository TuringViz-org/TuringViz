import { ReactFlowProvider } from '@xyflow/react';
import { GraphUIProvider } from '@components/shared/GraphUIContext';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { useComputationTreeNodeMode } from '@zustands/GraphZustand';
import { ConfigNodeMode, DEFAULT_TREE_DEPTH } from '@utils/constants';
import { ComputationTreeCards } from './ComputationTreeCards';
import { ComputationTreeCircles } from './ComputationTreeCircles';
import { useComputationTreeData } from './useComputationTreeData';
import type { Props } from './types';

// Preserve the public hook import while keeping graph computation renderer-independent.
export { useComputationTreeData } from './useComputationTreeData';

export function ComputationTree(props: Props) {
  const computationTreeNodeMode = useComputationTreeNodeMode();
  const treeData = useComputationTreeData(
    props.targetNodes,
    !!props.compressing,
    computationTreeNodeMode,
    !!props.paused,
    props.active ?? true
  );

  if (computationTreeNodeMode === ConfigNodeMode.CARDS) {
    return <ComputationTreeCards {...props} treeData={treeData} />;
  }
  return <ComputationTreeCircles {...props} treeData={treeData} />;
}

export function ComputationTreeWrapper({
  targetNodes = DEFAULT_TREE_DEPTH,
  compressing = false,
  paused = false,
  active = true,
}: {
  targetNodes?: number;
  compressing?: boolean;
  paused?: boolean;
  active?: boolean;
}) {
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);
  return (
    <ReactFlowProvider>
      <GraphUIProvider key={machineLoadVersion} active={active}>
        <ComputationTree
          targetNodes={targetNodes}
          compressing={compressing}
          paused={paused}
          active={active}
        />
      </GraphUIProvider>
    </ReactFlowProvider>
  );
}
