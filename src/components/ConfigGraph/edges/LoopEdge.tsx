import { useInternalNode, type Edge, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';

import type { ConfigEdgeData } from '../types';
import { getLoopEdgeParams } from './edgeUtils';
import { InteractiveEdge } from './InteractiveEdge';

/** Loop endpoints lie on the circle circumference or the card's top edge. */
const LoopEdgeComponent = ({
  id,
  source,
  style,
  markerEnd,
  data,
}: EdgeProps<Edge<ConfigEdgeData>>) => {
  const node = useInternalNode(source);
  if (!node) return null;

  const { sx, sy, ex, ey } = getLoopEdgeParams(node);
  const path = `M ${sx} ${sy} C ${sx} ${sy - 50}, ${ex} ${ey - 50}, ${ex} ${ey}`;

  return (
    <InteractiveEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={style}
      tooltip={{ transition: data?.transition }}
    />
  );
};

export const LoopEdge = memo(LoopEdgeComponent);
LoopEdge.displayName = 'LoopEdge';
