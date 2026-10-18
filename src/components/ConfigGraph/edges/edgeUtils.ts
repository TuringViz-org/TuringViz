import type { InternalNode } from '@xyflow/react';
import { NodeType } from '../util/constants';

// Node type determines loop geometry; floating edges use measured aspect ratio.
function isCircleNode(node: InternalNode) {
  return node.type === NodeType.CONFIG;
}

// Get the width and height of a node (circular or rectangular)
function getNodeSize(node: InternalNode) {
  const w = node.measured?.width ?? node.width ?? 0;
  const h = node.measured?.height ?? node.height ?? 0;

  return { w, h };
}

// Get the radius of a circular node based on its width
function getNodeRadius(node: InternalNode) {
  const { w, h } = getNodeSize(node);
  return Math.max(0, Math.min(w, h) / 2);
}

// Get the center coordinates of a circular node
export function getNodeCenter(node: InternalNode) {
  const { w, h } = getNodeSize(node);
  const pos = node.internals.positionAbsolute; // Top-left corner of the node
  return { cx: pos.x + w / 2, cy: pos.y + h / 2 };
}

/**
 * Intersection on the TARGET node along the line connecting the centers.
 * (Arrow tip: lies on the target node's boundary along the source→target line.)
 */
function getTargetIntersectionAlongCenters(
  source: InternalNode,
  target: InternalNode
) {
  const rt = getNodeRadius(target);
  const { cx: sx, cy: sy } = getNodeCenter(source);
  const { cx: tx, cy: ty } = getNodeCenter(target);

  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;

  return { x: tx - (dx / len) * rt, y: ty - (dy / len) * rt };
}

/**
 * Computes the start/end coords for a loop edge on a node.
 * - Nodes: two points on the circumference offset by a small angle
 * - Rectangles (Cards): two points on the top edge left/right of the center
 */
export function getLoopEdgeParams(node: InternalNode, offsetAngle = Math.PI / 6) {
  const { w, h } = getNodeSize(node);
  const { cx, cy } = getNodeCenter(node);

  if (isCircleNode(node)) {
    const r = Math.max(0, Math.min(w, h) / 2);
    const base = -Math.PI / 2;
    const angle1 = base + offsetAngle;
    const angle2 = base - offsetAngle;

    const sx = cx + Math.cos(angle1) * r;
    const sy = cy + Math.sin(angle1) * r;
    const ex = cx + Math.cos(angle2) * r;
    const ey = cy + Math.sin(angle2) * r;

    return { sx, sy, ex, ey };
  }

  // Rectangle (ConfigCardNode)
  const halfW = w / 2;
  const halfH = h / 2;
  const yTop = cy - halfH;

  // Horizontal distance from the center to each loop anchor,
  // limited to keep the anchors away from the corners.
  const spread = Math.max(8, Math.min(28, halfW - 12));

  const sx = cx - spread;
  const sy = yTop; // Exactly on the top edge
  const ex = cx + spread;
  const ey = yTop;

  return { sx, sy, ex, ey };
}

// Calculates intersection point on the boundary of a rectangular node
function getRectIntersectionAlongCenters(
  source: InternalNode,
  target: InternalNode
) {
  // Centers (target -> source vector)
  const { cx: sx, cy: sy } = getNodeCenter(source);
  const { cx: tx, cy: ty } = getNodeCenter(target);

  const dx = sx - tx;
  const dy = sy - ty;

  // If source and target centers coincide, return top center of target
  if (dx === 0 && dy === 0) {
    const { w, h } = getNodeSize(target);
    return { x: tx, y: ty - Math.max(1, h / 2) };
  }

  const { w, h } = getNodeSize(target);
  const halfW = Math.max(1e-6, w / 2);
  const halfH = Math.max(1e-6, h / 2);

  const eps = 1e-6;

  // Exact/nearly-vertical/horizontal branches without division by 0
  if (Math.abs(dx) < eps) {
    // exactly vertical: hit upper/lower edge
    return { x: tx, y: ty + Math.sign(dy) * halfH };
  }
  if (Math.abs(dy) < eps) {
    // Exactly horizontal: hit left/right edge
    return { x: tx + Math.sign(dx) * halfW, y: ty };
  }

  // General case: scale the line from the center to hit the outer edge.
  // t = min( halfW/|dx|, halfH/|dy| )  (no infinities, no max/1/x tricks)
  const t = Math.min(halfW / Math.abs(dx), halfH / Math.abs(dy));

  return { x: tx + dx * t, y: ty + dy * t };
}

// Generic intersection that decides circle vs. rectangle by aspect ratio
function getTargetIntersectionGeneric(source: InternalNode, target: InternalNode) {
  const { w, h } = getNodeSize(target);
  const isCircle = Math.abs(w - h) < 0.5;
  return isCircle
    ? getTargetIntersectionAlongCenters(source, target)
    : getRectIntersectionAlongCenters(source, target);
}

// Calculates edge params for edges between two circular nodes
// or two rectangular nodes
export function getFloatingEdgeParams(source: InternalNode, target: InternalNode) {
  const { cx: sx, cy: sy } = getNodeCenter(source);
  const t = getTargetIntersectionGeneric(source, target);
  return { sx, sy, tx: t.x, ty: t.y };
}
