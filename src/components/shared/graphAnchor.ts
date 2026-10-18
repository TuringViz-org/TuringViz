import type { VirtualElement } from '@popperjs/core';
import type { Core, Position } from 'cytoscape';
import type { GraphAnchor } from './GraphUIContext';

export function makeVirtualAnchor(anchor: GraphAnchor | null): VirtualElement {
  const top = anchor?.top ?? 0;
  const left = anchor?.left ?? 0;
  return {
    getBoundingClientRect: () => ({
      width: 0,
      height: 0,
      x: left,
      y: top,
      top,
      left,
      right: left,
      bottom: top,
      toJSON: () => {},
    }),
  };
}

export function getCytoscapeEventAnchor(
  container: HTMLElement | null,
  event: { renderedPosition?: Position }
): GraphAnchor {
  const rect = container?.getBoundingClientRect();
  return {
    top: (rect?.top ?? 0) + (event.renderedPosition?.y ?? 0),
    left: (rect?.left ?? 0) + (event.renderedPosition?.x ?? 0),
  };
}

export function getCytoscapeElementAnchor(
  cy: Core | null,
  container: HTMLElement | null,
  id: string
): GraphAnchor | null {
  try {
    const rect = container?.getBoundingClientRect();
    if (!cy || !rect) return null;
    const element = cy.getElementById(id);
    if (element.empty()) return null;
    const position =
      element.group() === 'edges'
        ? (element.renderedMidpoint() ?? element.renderedPosition())
        : element.renderedPosition();
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y))
      return null;
    return { top: rect.top + position.y, left: rect.left + position.x };
  } catch {
    return null;
  }
}
