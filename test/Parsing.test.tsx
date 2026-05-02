import { describe, it, expect, beforeEach } from 'vitest';

import { useGlobalZustand} from '@zustands/GlobalZustand';


import { Move, Transition, TapeContent, createTapeContent } from '@mytypes/TMTypes';
import { loadTuringMachineFromSource } from '@tmLanguage/loadMachine';

describe('Parsing Test', () => {
  beforeEach(() => {
    useGlobalZustand.getState().reset();
  });

  it('Parse the TMDescription and check wether everything is correctly passed to state', () => {
    const DESCRIPTION_VALUE = `tapes: 2
blank: " "
input: "1011" | ""
start: right

state right:
  on 1/* -> move R/R;
  on 0/" " -> move R/R;
  on [" "/" ", 1/5] -> move L/L; goto left;

state left:
  on 1/" " -> write 1/same; move R/S; goto right;

state done:`;

    const errors = loadTuringMachineFromSource(DESCRIPTION_VALUE);

    expect(errors).toEqual([]);

    // Check if the state is set correctly
    const state = useGlobalZustand.getState();

    // Check states
    expect([...state.states].sort()).toEqual(['left', 'right', 'done'].sort());

    expect(state.states.size).toBe(3);

    // Check start state
    expect(state.startState).toBe('right');

    // Check blank symbol
    expect(state.blank).toBe(' ');

    // Check number of tapes
    expect(state.numberOfTapes).toBe(2);

    // Check input
    expect(state.input).toEqual([
      [[], [{ value: '1' }, { value: '0' }, { value: '1' }, { value: '1' }]],
      [[], [{ value: ' ' }]]
    ]);

    // Check transitions
    const transitions = state.transitions;

    // Check "right" State Transitions
    const rightTransitions = transitions.get('right') || [];
    expect(rightTransitions.length).toBe(4);
    expect(rightTransitions).toContainEqual({
      from: 'right',
      to: 'right',
      tapecondition: [{ value: '1' }, {}],
      write: [{}, {}],
      direction: [Move.R, Move.R]
    });
    expect(rightTransitions).toContainEqual({
      from: 'right',
      to: 'right',
      tapecondition: [{ value: '0' }, { value: ' ' }],
      write: [{}, {}],
      direction: [Move.R, Move.R]
    });
    expect(rightTransitions).toContainEqual({
      from: 'right',
      to: 'left',
      tapecondition: [{ value: ' ' }, { value: ' ' }],
      write: [{}, {}],
      direction: [Move.L, Move.L]
    });
    expect(rightTransitions).toContainEqual({
      from: 'right',
      to: 'left',
      tapecondition: [{ value: '1' }, { value: '5' }],
      write: [{}, {}],
      direction: [Move.L, Move.L]
    });

    // Check 'carry' State Transitions
    const leftTransitions = transitions.get('left') || [];
    expect(leftTransitions.length).toBe(1);
    expect(leftTransitions).toContainEqual({
      from: 'left',
      to: 'right',
      tapecondition: [{ value: '1' }, { value: ' ' }],
      write: [{ value: '1' }, {}],
      direction: [Move.R, Move.S]
    });

    // Check "done" State Transitions --> Should be empty
    const doneTransitions = transitions.get('done') || [];
    expect(doneTransitions.length).toBe(0);

    // Check tapes
    expect(JSON.stringify(state.tapes)).toBe(JSON.stringify(state.input));
  });

  it('parses nondeterministic array of movement strings for 1-tape', () => {
    const DESCRIPTION_VALUE = `tapes: 1
blank: " "
input: ""
start: s

state s:
  on 1 -> choose {
    move R;
    move L;
  }

state done:`;

    const errors = loadTuringMachineFromSource(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const state = useGlobalZustand.getState();
    expect([...state.states].sort()).toEqual(['done', 's'].sort());
    expect(state.numberOfTapes).toBe(1);

    const transitions = state.transitions.get('s') || [];
    expect(transitions.length).toBe(2);

    expect(transitions).toContainEqual({
      from: 's',
      to: 's',
      tapecondition: [{ value: '1' }],
      write: [{}],
      direction: [Move.R],
    });
    expect(transitions).toContainEqual({
      from: 's',
      to: 's',
      tapecondition: [{ value: '1' }],
      write: [{}],
      direction: [Move.L],
    });
  });

  it('parses nondeterministic array of action objects for 2-tapes', () => {
    const DESCRIPTION_VALUE = `tapes: 2
blank: " "
input: "" | ""
start: right

state right:
  on " "/* -> choose {
    move L/R; goto carry;
    write " "/" "; move S/S; goto done;
  }

state carry:

state done:`;

    const errors = loadTuringMachineFromSource(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const state = useGlobalZustand.getState();
    expect([...state.states].sort()).toEqual(['carry', 'done', 'right'].sort());
    expect(state.numberOfTapes).toBe(2);

    const rightTransitions = state.transitions.get('right') || [];
    expect(rightTransitions.length).toBe(2);

    // First option in the array: {'L/R': carry}
    expect(rightTransitions).toContainEqual({
      from: 'right',
      to: 'carry',
      tapecondition: [{ value: ' ' }, {}], // ' /all' => [blank, any]
      write: [{}, {}], // default 'same' for both tapes
      direction: [Move.L, Move.R],
    });

    // Second option in the array: {write: ' / ', 'S/S': done}
    expect(rightTransitions).toContainEqual({
      from: 'right',
      to: 'done',
      tapecondition: [{ value: ' ' }, {}],
      write: [{ value: ' ' }, { value: ' ' }],
      direction: [Move.S, Move.S],
    });
  });

  it('parses mixed arrays (string + object) with bracketed keys for 3-tapes', () => {
    const DESCRIPTION_VALUE = `tapes: 3
blank: " "
input: "" | "" | ""
start: q

state q:
  on [a/b/c, */*/*] -> choose {
    move R/S/L;
    write same/x/same; move S/S/S; goto done;
  }

state done:`;

    const errors = loadTuringMachineFromSource(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const state = useGlobalZustand.getState();
    expect([...state.states].sort()).toEqual(['done', 'q'].sort());
    expect(state.numberOfTapes).toBe(3);

    const qTransitions = state.transitions.get('q') || [];
    // Two patterns in the bracket * two actions in the array = 4 transitions
    expect(qTransitions.length).toBe(4);

    // One transition produced by the string action for the first pattern a/b/c
    expect(qTransitions).toContainEqual({
      from: 'q',
      to: 'q',
      tapecondition: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
      write: [{}, {}, {}],
      direction: [Move.R, Move.S, Move.L],
    });

    // One transition produced by the object action for the second pattern all/all/all
    expect(qTransitions).toContainEqual({
      from: 'q',
      to: 'done',
      tapecondition: [{}, {}, {}],
      write: [{}, { value: 'x' }, {}],
      direction: [Move.S, Move.S, Move.S],
    });
  });
});
