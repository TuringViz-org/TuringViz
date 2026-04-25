// src/utils/ColorMatching.ts
//For the coloring of the nodes in the configgraph and tree.
const distinctColors: string[] = [
  '#772b9d',
  '#632819',
  '#37294f',
  '#e68f66',
  '#3998f5',
  '#29bdab',
  '#235b54',
  '#ffc413',
  '#201923',
  '#946aa2',
  '#b732cc',
  '#3750db',
  '#c56133',
  '#f07cab',
  '#228c68',
  '#96341c',
  '#c3a5b4',
  '#ff9300',
  '#fcff5d',
  '#d30b94',
  '#8ad8e8',
  '#991919',
  '#ffffff',
  '#85d600',
  '#5d4c86',
  '#ffcba5',
  '#2f2aa0',
  '#f47a22',
];

const acceptingStates = ['accept', 'accepted', 'done'];
const rejectingStates = ['reject', 'rejected', 'error'];

const acceptingColor = '#00ff00ff'; // Matches theme.palette.success.light
const rejectingColor = '#ff0000ff'; // Matches theme.palette.error.light

export function getColorMatching(
  newstates: Set<string>,
  oldMatching: Map<string, string>
): Map<string, string> {
  const newMatching = new Map<string, string>();

  // First carry over old matchings
  for (const state of newstates) {
    if (oldMatching.has(state)) {
      newMatching.set(state, oldMatching.get(state)!);
    } else if (acceptingStates.includes(state.toLowerCase())) {
      newMatching.set(state, acceptingColor);
    } else if (rejectingStates.includes(state.toLowerCase())) {
      newMatching.set(state, rejectingColor);
    }
  }

  // Create set with still available colors and set with states that still need a color
  const availableColors = new Set(distinctColors);
  const statesStillToSet = new Set<string>();

  for (const [state, color] of newMatching) {
    if (availableColors.has(color)) {
      availableColors.delete(color);
    }
  }

  for (const state of newstates) {
    if (!newMatching.has(state)) {
      statesStillToSet.add(state);
    }
  }

  // Assign still available colors to states that still need a color
  const availableColorsArray = Array.from(availableColors);
  let colorIndex = 0;
  for (const state of statesStillToSet) {
    if (colorIndex < availableColorsArray.length) {
      newMatching.set(state, availableColorsArray[colorIndex]);
      colorIndex++;
    } else {
      // If we run out of distinct colors, we start reusing from the beginning
      newMatching.set(
        state,
        availableColorsArray[colorIndex % availableColorsArray.length]
      );
      colorIndex++;
    }
  }

  return newMatching;
}
