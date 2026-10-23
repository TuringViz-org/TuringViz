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

/**
 * Preserve element identity and interaction styling without invalidating unchanged
 * render data. Nested values that affect styling must be replaced when changed.
 */
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
        // Cytoscape retains these objects. Own copies keep later in-place edits
        // to the caller's definitions detectable by the comparisons below.
        cy.add({
          ...definition,
          data: { ...definition.data },
          ...(definition.position && { position: { ...definition.position } }),
        });
      } else {
        const currentData = element.data();
        if (
          Object.keys(definition.data).some(
            (key) =>
              !Object.hasOwn(currentData, key) ||
              !Object.is(currentData[key], definition.data[key])
          )
        ) {
          // data() merges supplied fields; fields absent from this update stay.
          element.data(definition.data);
        }
        if (definition.position) {
          const currentPosition = element.position();
          if (
            !Object.is(currentPosition.x, definition.position.x) ||
            !Object.is(currentPosition.y, definition.position.y)
          ) {
            element.position(definition.position);
          }
        }

        const currentClasses = element.classes();
        const nextClasses = new Set(
          Array.isArray(definition.classes)
            ? definition.classes
            : (definition.classes?.match(/\S+/g) ?? [])
        );
        for (const name of currentClasses) {
          if (INTERACTION_CLASSES.has(name)) nextClasses.add(name);
        }
        if (
          currentClasses.length !== nextClasses.size ||
          currentClasses.some((name) => !nextClasses.has(name))
        ) {
          element.classes([...nextClasses]);
        }
      }
    }
  });
}
