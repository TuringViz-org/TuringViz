// src/components/TMGraph/edges/edgeUtils.ts
import { Position, InternalNode } from '@xyflow/react';
import { NodeType } from '../util/constants';

// Decide if node is (almost) a circle
function isCircleNode(node: InternalNode) {
  return node.type === NodeType.CONFIG;
}

// Get the width and height of a node (circular or rectangular)
function getNodeSize(node: InternalNode) {
  const w =
    (node.measured?.width as number | undefined) ??
    (node.width as number | undefined) ??
    0;
  const h =
    (node.measured?.height as number | undefined) ??
    (node.height as number | undefined) ??
    0;

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
  const pos = node.internals.positionAbsolute; // top-left der Node
  return { cx: pos.x + w / 2, cy: pos.y + h / 2 };
}

/**
 * Returns the intersection point on the circumference of a circular node (source)
 * along the line to the center of another node (target).
 */
export function getCircleIntersection(source: InternalNode, target: InternalNode) {
  const r = getNodeRadius(source);
  const { cx, cy } = getNodeCenter(source);
  const { cx: tx, cy: ty } = getNodeCenter(target);

  const dx = tx - cx;
  const dy = ty - cy;
  const len = Math.hypot(dx, dy) || 1;

  return { x: cx + (dx / len) * r, y: cy + (dy / len) * r };
}

/**
 * Intersection on the TARGET node along the line connecting the centers.
 * (Arrow tip: lies on the target node's boundary along the source→target line.)
 */
export function getTargetIntersectionAlongCenters(
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

// Intersection offset by a small angle around the circle.
export function getOffsetIntersection(
  node: InternalNode,
  other: InternalNode,
  deltaAngle: number
) {
  const r = getNodeRadius(node);
  const { cx, cy } = getNodeCenter(node);
  const { cx: tx, cy: ty } = getNodeCenter(other);

  const base = Math.atan2(ty - cy, tx - cx);
  const angle = base + deltaAngle;
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

/**
 * Computes the loop anchor point above the node.
 * - Nodes: on top of the circle + offset
 * - Rectangles (Cards): above the top center + offset
 */
export function getLoopPoint(node: InternalNode, offset = 10) {
  const { w, h } = getNodeSize(node);
  const { cx, cy } = getNodeCenter(node);

  if (isCircleNode(node)) {
    const r = Math.max(0, Math.min(w, h) / 2);
    const angle = -Math.PI / 2;
    const sx = cx + Math.cos(angle) * (r + offset);
    const sy = cy + Math.sin(angle) * (r + offset);
    return { x: sx, y: sy, position: Position.Top };
  }

  // Rectangle case: top center with offset
  const yTop = cy - h / 2;
  return { x: cx, y: yTop - offset, position: Position.Top };
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

  // Rechteck (ConfigCardNode)
  const halfW = w / 2;
  const halfH = h / 2;
  const yTop = cy - halfH;

  // Horizontaler Abstand links/rechts vom Mittelpunkt für die Loop-Anker
  // (begrenzt, damit wir nicht bis in die Ecken gehen)
  const spread = Math.max(8, Math.min(28, halfW - 12));

  const sx = cx - spread;
  const sy = yTop; // exakt auf der oberen Kante
  const ex = cx + spread;
  const ey = yTop;

  return { sx, sy, ex, ey };
}

// Calculates intersection point on the boundary of a rectangular node
function getRectIntersectionAlongCenters(
  source: InternalNode,
  target: InternalNode
) {
  // Centers (target -> source Vektor)
  const { cx: sx, cy: sy } = getNodeCenter(source);
  const { cx: tx, cy: ty } = getNodeCenter(target);

  let dx = sx - tx;
  let dy = sy - ty;

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
export function getFloatingEdgeParams(
  source: InternalNode,
  target: InternalNode,
  _isReverse = false,
  _sign = 1
) {
  const { cx: sx, cy: sy } = getNodeCenter(source);
  const t = getTargetIntersectionGeneric(source, target);
  return { sx, sy, tx: t.x, ty: t.y };
}
