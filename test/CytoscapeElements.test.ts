import cytoscape from 'cytoscape';
import { describe, expect, it } from 'vitest';
import { syncCytoscapeElements } from '@components/shared/cytoscapeElements';

// Runtime classes belong to interaction state; builders replace structural classes.
describe('Cytoscape element reconciliation', () => {
  it.each(['ct-selected', 'ct-highlighted', 'tm-highlighted', 'hovered'])(
    'preserves %s on an existing element while replacing its data and structural classes',
    (interactionClass) => {
      const cy = cytoscape({ headless: true });
      try {
        syncCytoscapeElements(cy, [
          {
            group: 'nodes',
            data: { id: 'a', label: 'old' },
            classes: 'circle pending',
            position: { x: 10, y: 20 },
          },
        ]);
        const node = cy.getElementById('a');
        node.addClass(interactionClass);
        syncCytoscapeElements(cy, [
          {
            group: 'nodes',
            data: { id: 'a', label: 'updated' },
            classes: 'circle current',
            position: { x: 90, y: 80 },
          },
        ]);
        expect(cy.getElementById('a')[0]).toBe(node[0]);
        expect(node.data('label')).toBe('updated');
        expect(node.position()).toEqual({ x: 90, y: 80 });
        expect(node.hasClass('pending')).toBe(false);
        expect(node.hasClass('current')).toBe(true);
        expect(node.hasClass(interactionClass)).toBe(true);
      } finally {
        cy.destroy();
      }
    }
  );
});
