import { describe, it, expect, beforeEach } from 'vitest';

import { useGlobalZustand} from '@zustands/GlobalZustand';

import { Move, Transition, TapeContent, createTapeContent } from '@mytypes/TMTypes';

describe('useGlobalZustand store', () => {
  beforeEach(() => {
    useGlobalZustand.getState().reset();
  });

  it('should set and get states (Set<string>)', () => {
    const states = new Set(['q0', 'q1', 'q2']);
    useGlobalZustand.getState().setStates(states);
    expect(Array.from(useGlobalZustand.getState().states)).toEqual([
      'q0',
      'q1',
      'q2',
    ]);
  });

  it('should set and get startState', () => {
    useGlobalZustand.getState().setStartState('q0');
    expect(useGlobalZustand.getState().startState).toBe('q0');
  });

  it('should set and get currentState', () => {
    useGlobalZustand.getState().setCurrentState('q1');
    expect(useGlobalZustand.getState().currentState).toBe('q1');
  });

  it('should set and get transitions (Map<string, Transition[]>)', () => {
    const transitions: Map<string, Transition[]> = new Map();
    transitions.set('q0', [
      {
        to: 'q1',
        from: 'q0',
        write: ['a'],
        tapecondition: ['a'],
        direction: [Move.R],
      },
    ]);
    useGlobalZustand.getState().setTransitions(transitions);
    const storeTransitions = useGlobalZustand.getState().transitions;
    expect(Array.from(storeTransitions.entries())).toEqual(
      Array.from(transitions.entries())
    );
  });

  it('should set and get blank symbol', () => {
    useGlobalZustand.getState().setBlank('_');
    expect(useGlobalZustand.getState().blank).toBe('_');
  });

  it('should set and get tapes (Symbol[][])', () => {
    const tapes: TapeContent = [[[{value: 'a'}], [{value: 'a'}]], [[{value: 'b'}], [{value: 'c'}]]];
    useGlobalZustand.getState().setTapes(tapes);
    expect(useGlobalZustand.getState().tapes).toEqual(tapes);
  });

  it('should set and get numberOfTapes', () => {
    useGlobalZustand.getState().setNumberOfTapes(3);
    expect(useGlobalZustand.getState().numberOfTapes).toBe(3);
  });

  it('should set and get heads (number[])', () => {
    useGlobalZustand.getState().setHeads([0, 1, -2]);
    expect(useGlobalZustand.getState().heads).toEqual([0, 1, -2]);
  });

  it('should set and get running flag', () => {
    useGlobalZustand.getState().setRunning(true);
    expect(useGlobalZustand.getState().running).toBe(true);
    useGlobalZustand.getState().setRunning(false);
    expect(useGlobalZustand.getState().running).toBe(false);
  });

  it('should set and get input string', () => {
    useGlobalZustand.getState().setInput(createTapeContent([[[], ["i", "n", "p", "u", "t"]], [[], []], [[], []]]));
    expect(JSON.stringify(useGlobalZustand.getState().input)).toBe(JSON.stringify(createTapeContent([[[], ["i", "n", "p", "u", "t"]], [[], []], [[], []]])));
  });

  it('should set all values at once with setAll', () => {
    const states = new Set(['a', 'b']);
    const startState = 'a';
    const transitions: Map<string, Transition[]> = new Map();
    transitions.set('a', [
      {
        to: 'b',
        from: 'a',
        write: ['x'],
        tapecondition: ['y'],
        direction: [Move.L],
      },
    ]);
    const blank = '-';
    const numberOfTapes = 2;
    const input = createTapeContent([[[], ['1']], [[], ['0']]]);

    useGlobalZustand
      .getState()
      .setAll(
        states,
        startState,
        transitions,
        blank,
        numberOfTapes,
        input,
        null
      );

    expect(Array.from(useGlobalZustand.getState().states)).toEqual(['a', 'b']);
    expect(useGlobalZustand.getState().startState).toBe('a');
    expect(Array.from(useGlobalZustand.getState().transitions.entries())).toEqual(
      Array.from(transitions.entries())
    );
    expect(useGlobalZustand.getState().blank).toBe('-');
    expect(useGlobalZustand.getState().input).toEqual(input);
    expect(useGlobalZustand.getState().tapes).toEqual(input);
    expect(useGlobalZustand.getState().input).not.toBe(input);
    expect(useGlobalZustand.getState().tapes).not.toBe(input);
    expect(useGlobalZustand.getState().numberOfTapes).toBe(2);
  });

  it('should reset all fields to default', () => {
    // Set custom values
    useGlobalZustand.getState().setStates(new Set(['foo']));
    useGlobalZustand.getState().setStartState('bar');
    useGlobalZustand.getState().setCurrentState('baz');
    useGlobalZustand.getState().setTransitions(new Map([['foo', []]]));
    useGlobalZustand.getState().setBlank('#');
    useGlobalZustand.getState().setTapes([[[{value: 'x'}], [{value: 'y'}]]]);
    useGlobalZustand.getState().setNumberOfTapes(4);
    useGlobalZustand.getState().setHeads([2, 3, 4]);
    useGlobalZustand.getState().setRunning(true);
    useGlobalZustand.getState().setInput(createTapeContent([[[], ["1", "0", "0", "1"]], [[], []], [[], []]]));

    // Call reset
    useGlobalZustand.getState().reset();

    expect(Array.from(useGlobalZustand.getState().states)).toEqual([]);
    expect(useGlobalZustand.getState().startState).toBe('');
    expect(useGlobalZustand.getState().currentState).toBe('');
    expect(Array.from(useGlobalZustand.getState().transitions.entries())).toEqual(
      []
    );
    expect(useGlobalZustand.getState().blank).toBe(' ');
    expect(useGlobalZustand.getState().tapes).toEqual([[[], []]]);
    expect(useGlobalZustand.getState().numberOfTapes).toBe(1);
    expect(useGlobalZustand.getState().heads).toEqual([0]);
    expect(useGlobalZustand.getState().running).toBe(false);
    expect(JSON.stringify(useGlobalZustand.getState().input)).toBe(JSON.stringify(createTapeContent([[[], []]])));
  });
});
