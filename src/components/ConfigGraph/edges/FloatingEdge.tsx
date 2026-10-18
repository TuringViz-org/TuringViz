import {
  useInternalNode,
  type Edge,
  type EdgeProps,
  type Node,
} from '@xyflow/react';
import { memo } from 'react';

import type { ConfigEdgeData, ConfigNodeData } from '../types';
import { getFloatingEdgeParams, getNodeCenter } from './edgeUtils';
import { InteractiveEdge } from './InteractiveEdge';

/** Edge from the source center to the target boundary, with optional curvature. */
const FloatingEdgeComponent = ({
  id,
  source,
  target,
  markerEnd,
  style,
  data,
}: EdgeProps<Edge<ConfigEdgeData>>) => {
  const sourceNode = useInternalNode<Node<ConfigNodeData>>(source);
  const targetNode = useInternalNode<Node<ConfigNodeData>>(target);
  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty } = getFloatingEdgeParams(sourceNode, targetNode);

  // Use a canonical direction so opposite edges bend on opposite sides.
  const sourceFirst = source < target;
  const { cx: ax, cy: ay } = getNodeCenter(sourceFirst ? sourceNode : targetNode);
  const { cx: bx, cy: by } = getNodeCenter(sourceFirst ? targetNode : sourceNode);
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  const bendSign =
    data?.bendDirection === 'up' ? 1 : data?.bendDirection === 'down' ? -1 : 0;
  const curveOffset = data?.bended === true ? 28 * bendSign : 0;
  const controlX = (sx + tx) / 2 + (-dy / length) * curveOffset;
  const controlY = (sy + ty) / 2 + (dx / length) * curveOffset;
  const path =
    curveOffset !== 0
      ? `M ${sx},${sy} Q ${controlX},${controlY} ${tx},${ty}`
      : `M ${sx},${sy} L ${tx},${ty}`;

  return (
    <InteractiveEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={style}
      tooltip={{
        sourceLabel: sourceNode.data.label ?? source,
        targetLabel: targetNode.data.label ?? target,
        transition: data?.transition,
        isCompressed: data?.compressed === true,
        compressedLength: data?.compressedLength,
      }}
    />
  );
};

export const FloatingEdge = memo(FloatingEdgeComponent);
FloatingEdge.displayName = 'FloatingEdge';
