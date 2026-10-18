import type { Core } from 'cytoscape';

export type CytoscapeViewport = { zoom: number; pan: { x: number; y: number } };

/** Keep the starting configuration on screen after the graph fit. */
export function ensureStartNodeVisible(cy: Core, margin = 24) {
  const startNode = cy.nodes('.start').first();
  if (!startNode || startNode.empty()) return;
  const rendered = startNode.renderedPosition();
  if (!rendered || !Number.isFinite(rendered.x) || !Number.isFinite(rendered.y))
    return;

  const width = cy.width();
  const height = cy.height();
  if (!(width > 0) || !(height > 0)) return;

  let dx = 0;
  let dy = 0;

  if (rendered.x < margin) dx = margin - rendered.x;
  else if (rendered.x > width - margin) dx = width - margin - rendered.x;

  if (rendered.y < margin) dy = margin - rendered.y;
  else if (rendered.y > height - margin) dy = height - margin - rendered.y;

  if (dx === 0 && dy === 0) return;

  const pan = cy.pan();
  cy.pan({ x: pan.x + dx, y: pan.y + dy });
}
