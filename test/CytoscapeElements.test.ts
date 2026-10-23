import cytoscape from 'cytoscape';
import { describe, expect, it, vi } from 'vitest';
import {
  syncCytoscapeElements,
  type CytoscapeElement,
} from '@components/shared/cytoscapeElements';

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

  it('preserves exact graph data, positions, classes and retained identity across additions and removals', () => {
    const cy = cytoscape({ headless: true });
    try {
      syncCytoscapeElements(cy, [
        {
          data: { id: 'a', label: 'old', retained: true },
          position: { x: 1, y: 2 },
          classes: 'node pending',
        },
        { data: { id: 'b' }, position: { x: 3, y: 4 }, classes: 'node' },
        { data: { id: 'removed' } },
        {
          data: { id: 'ab', source: 'a', target: 'b', label: 'old' },
          classes: 'edge',
        },
        { data: { id: 'removed-edge', source: 'b', target: 'removed' } },
      ]);
      const retainedNode = cy.getElementById('a')[0];
      const retainedEdge = cy.getElementById('ab')[0];
      retainedNode.addClass('ct-selected');
      retainedEdge.addClass('hovered');
      syncCytoscapeElements(cy, [
        {
          data: { id: 'a', label: 'new' },
          position: { x: 10, y: 20 },
          classes: ['node', 'current', 'current'],
        },
        { data: { id: 'b' }, position: { x: 30, y: 40 }, classes: 'node' },
        {
          data: { id: 'added' },
          position: { x: 50, y: 60 },
          classes: 'node pending',
        },
        {
          data: { id: 'ab', source: 'a', target: 'b', label: 'new' },
          classes: 'edge hidden-label',
        },
        {
          data: { id: 'added-edge', source: 'b', target: 'added' },
          classes: 'edge',
        },
      ]);
      expect(cy.getElementById('a')[0]).toBe(retainedNode);
      expect(cy.getElementById('ab')[0]).toBe(retainedEdge);
      expect(
        cy
          .elements()
          .map((element) => ({
            data: element.data(),
            position: element.isNode() ? element.position() : undefined,
            classes: element.classes().sort(),
          }))
          .sort((a, b) => a.data.id.localeCompare(b.data.id))
      ).toEqual([
        {
          data: { id: 'a', label: 'new', retained: true },
          position: { x: 10, y: 20 },
          classes: ['ct-selected', 'current', 'node'],
        },
        {
          data: { id: 'ab', source: 'a', target: 'b', label: 'new' },
          position: undefined,
          classes: ['edge', 'hidden-label', 'hovered'],
        },
        {
          data: { id: 'added' },
          position: { x: 50, y: 60 },
          classes: ['node', 'pending'],
        },
        {
          data: { id: 'added-edge', source: 'b', target: 'added' },
          position: undefined,
          classes: ['edge'],
        },
        { data: { id: 'b' }, position: { x: 30, y: 40 }, classes: ['node'] },
      ]);
    } finally {
      cy.destroy();
    }
  });

  it('skips all unchanged setters and changes only positions after a layout', () => {
    const cy = cytoscape({ headless: true, styleEnabled: true });
    try {
      const definition: CytoscapeElement = {
        data: { id: 'a', label: 'same' },
        position: { x: 10, y: 20 },
        classes: 'node current',
      };
      syncCytoscapeElements(cy, [definition]);
      const node = cy.getElementById('a');
      node.addClass('ct-selected');
      const data = vi.spyOn(node, 'data');
      const position = vi.spyOn(node, 'position');
      const classes = vi.spyOn(node, 'classes');
      const styleEvent = vi.fn();
      const positionEvent = vi.fn();
      cy.on('style', styleEvent);
      cy.on('position', positionEvent);

      syncCytoscapeElements(cy, [
        {
          ...definition,
          data: { ...definition.data },
          position: { ...definition.position! },
        },
      ]);
      expect(data.mock.calls.filter((args) => args.length)).toEqual([]);
      expect(position.mock.calls.filter((args) => args.length)).toEqual([]);
      expect(classes.mock.calls.filter((args) => args.length)).toEqual([]);
      expect(styleEvent).not.toHaveBeenCalled();
      expect(positionEvent).not.toHaveBeenCalled();

      syncCytoscapeElements(cy, [{ ...definition, position: { x: 90, y: 80 } }]);
      expect(data.mock.calls.filter((args) => args.length)).toEqual([]);
      expect(position.mock.calls.filter((args) => args.length)).toEqual([
        [{ x: 90, y: 80 }],
      ]);
      expect(classes.mock.calls.filter((args) => args.length)).toEqual([]);
      expect(styleEvent).not.toHaveBeenCalled();
      expect(positionEvent).toHaveBeenCalledOnce();
    } finally {
      cy.destroy();
    }
  });

  it('detects in-place definition edits without allowing Cytoscape to mutate caller data or positions', () => {
    const cy = cytoscape({ headless: true, styleEnabled: true });
    try {
      const definition: CytoscapeElement = {
        data: { id: 'a', label: 'before' },
        position: { x: 1, y: 2 },
      };
      syncCytoscapeElements(cy, [definition]);
      const node = cy.getElementById('a');
      expect(node.data()).not.toBe(definition.data);
      expect(node.position()).not.toBe(definition.position);
      const dataEvent = vi.fn();
      const positionEvent = vi.fn();
      cy.on('data', dataEvent);
      cy.on('position', positionEvent);
      definition.data.label = 'after';
      definition.position!.x = 50;
      syncCytoscapeElements(cy, [definition]);
      expect(node.data('label')).toBe('after');
      expect(node.position()).toEqual({ x: 50, y: 2 });
      expect(dataEvent).toHaveBeenCalledOnce();
      expect(positionEvent).toHaveBeenCalledOnce();
      node.data('label', 'external');
      node.position({ x: 100, y: 200 });
      expect(definition.data.label).toBe('after');
      expect(definition.position).toEqual({ x: 50, y: 2 });
      syncCytoscapeElements(cy, [definition]);
      expect(node.data('label')).toBe('after');
      expect(node.position()).toEqual({ x: 50, y: 2 });
    } finally {
      cy.destroy();
    }
  });

  it('merges incoming fields, preserves absent fields and detects nested payload replacements', () => {
    const cy = cytoscape({ headless: true });
    try {
      const transition = { target: 'q1' };
      syncCytoscapeElements(cy, [
        { data: { id: 'a', retained: 'value', transition } },
      ]);
      const node = cy.getElementById('a');
      expect(node.data('transition')).toBe(transition);
      const dataEvent = vi.fn();
      cy.on('data', dataEvent);
      const replacement = { target: 'q2' };
      syncCytoscapeElements(cy, [
        { data: { id: 'a', transition: replacement, optional: undefined } },
      ]);
      expect(node.data()).toEqual({
        id: 'a',
        retained: 'value',
        transition: replacement,
        optional: undefined,
      });
      expect(Object.hasOwn(node.data(), 'optional')).toBe(true);
      expect(node.data('transition')).toBe(replacement);
      expect(dataEvent).toHaveBeenCalledOnce();
      syncCytoscapeElements(cy, [{ data: { id: 'a', transition: replacement } }]);
      expect(dataEvent).toHaveBeenCalledOnce();
    } finally {
      cy.destroy();
    }
  });
});
