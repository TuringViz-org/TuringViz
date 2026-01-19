import { CONFIG_CARD_WIDTH, CONFIG_NODE_DIAMETER, NodeType } from './constants';
import type { CTNode } from './buildComputationTree';

export type PositionedNode = CTNode & {
  position: { x: number; y: number };
  width?: number;
  height?: number;
};

const getNodeSize = (node: PositionedNode) => {
  const fallback = node.type === NodeType.CONFIG ? CONFIG_NODE_DIAMETER : CONFIG_CARD_WIDTH;
  const w = node.width ?? fallback;
  const h = node.height ?? fallback;
  return { w, h };
};

export const getNodeCenter = (node: PositionedNode) => {
  const { w, h } = getNodeSize(node);
  return {
    cx: node.position.x + w / 2,
    cy: node.position.y + h / 2,
    w,
    h,
  };
};

const getTargetIntersection = (source: PositionedNode, target: PositionedNode) => {
  const { cx: sx, cy: sy } = getNodeCenter(source);
  const { cx: tx, cy: ty, w, h } = getNodeCenter(target);

  const dx = tx - sx;
  const dy = ty - sy;

  const halfW = Math.max(1, w / 2);
  const halfH = Math.max(1, h / 2);

  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
    return { x: tx, y: ty - halfH };
  }

  // Decide if we treat node as circle (width ≈ height)
  const treatAsCircle = Math.abs(w - h) < 0.5 || target.type === NodeType.CONFIG;

  if (treatAsCircle) {
    const len = Math.hypot(dx, dy) || 1;
    const r = Math.min(halfW, halfH);
    return { x: tx - (dx / len) * r, y: ty - (dy / len) * r };
  }

  const t = Math.min(halfW / Math.abs(dx || 1e-6), halfH / Math.abs(dy || 1e-6));
  return { x: tx - dx * t, y: ty - dy * t };
};

export const getFloatingEdgePoints = (source: PositionedNode, target: PositionedNode) => {
  const { cx: sx, cy: sy } = getNodeCenter(source);
  const targetPoint = getTargetIntersection(source, target);

  return {
    sx,
    sy,
    tx: targetPoint.x,
    ty: targetPoint.y,
  };
};
