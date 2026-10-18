import type { Core, ElementDefinition } from 'cytoscape';

export type CytoscapeElement = ElementDefinition & {
  data: ElementDefinition['data'] & { id: string };
};

const INTERACTION_CLASSES = new Set([
  'ct-selected',
  'ct-highlighted',
  'tm-highlighted',
  'hovered',
]);

/** Preserve both element identity and interaction styling during data updates. */
export function syncCytoscapeElements(
  cy: Core,
  elements: readonly CytoscapeElement[]
) {
  const nextIds = new Set(elements.map(({ data }) => data.id));
  cy.batch(() => {
    cy.elements().forEach((element) => {
      if (!nextIds.has(element.id())) element.remove();
    });
    for (const definition of elements) {
      const element = cy.getElementById(definition.data.id);
      if (element.empty()) {
        cy.add(definition);
      } else {
        const interactionClasses = element
          .classes()
          .filter((name) => INTERACTION_CLASSES.has(name));
        element.data(definition.data);
        if (definition.position) element.position(definition.position);
        element.classes(definition.classes ?? '').addClass(interactionClasses);
      }
    }
  });
}
