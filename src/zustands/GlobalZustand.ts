// src/zustands/GlobalZustand.ts
import { create } from 'zustand';

import { Transition, TapeContent, Configuration } from '@mytypes/TMTypes';
import { ConfigGraph } from '@tmfunctions/ConfigGraph';
import { getColorMatching} from '@utils/ColorMatching';

export type RunChoiceOption = {
  config: Configuration;
  transitionIndex: number;
  transition: Transition;
};

export type RunChoiceStateGroup = {
  nextState: string;
  edgeId: string;
  options: RunChoiceOption[];
};

export type PendingRunChoice = {
  fromConfig: Configuration;
  byState: RunChoiceStateGroup[];
  selectedState: string | null;
};

interface GlobalZustand {
  //For the initialization of the TM
  setAll: (
    states: Set<string>,
    startState: string,
    transitions: Map<string, Transition[]>,
    blank: string,
    numberOfTapes: number,
    configGraph: ConfigGraph | null
  ) => void;

  //For the states
  states: Set<string>;
  setStates: (states: Set<string>) => void;

  //Start state
  startState: string;
  setStartState: (state: string) => void;

  //Last used state; Should be set to the last state after a step
  lastState: string;
  setLastState: (state: string) => void;

  //Last used transition; Should be set to the last transition after a step (Index in the transition list of the last state)
  lastTransition: number;
  setLastTransition: (transition: number) => void;

  //For the current state
  currentState: string;
  setCurrentState: (state: string) => void;

  //For the transitions
  transitions: Map<string, Transition[]>; //Maps the state to the list of transitions valid from that state
  setTransitions: (transitions: Map<string, Transition[]>) => void;

  //The blank symbol
  blank: string;
  setBlank: (blank: string) => void;

  //For the tapes
  tapes: TapeContent; //The list of tapes. Each tape consists of 2 lists of symbols. The first tape is to the left and the second tape is to the right
  setTapes: (tapes: TapeContent) => void;

  //Number of tapes
  numberOfTapes: number; //The number of tapes
  setNumberOfTapes: (numberOfTapes: number) => void;

  //Heads
  heads: number[]; //The list of heads. Each head is the index of the symbol in the tape. Negativ values are to the left and positive values are to the right. 0 is the first symbol on the right tape --> On the left tape the index is -i + 1
  setHeads: (heads: number[]) => void;

  //Running
  running: boolean; //If a change on tapes/heads should be animated or not. running --> animated
  setRunning: (running: boolean) => void;

  runningLive: boolean; //If the TM is running live --> If there is a timer running the TM
  setRunningLive: (runningLive: boolean) => void;

  runningLiveID: number;
  incrementRunningLiveID: () => void;

  //Input
  input: TapeContent; //The input to the TM
  setInput: (input: TapeContent) => void;

  configGraph: ConfigGraph | null; //The graph representation of the configurations of the TM
  setConfigGraph: (configGraph: ConfigGraph) => void;

  //This should be incremented every time the config graph is changed, so that the components can react to changes in the config graph
  configGraphVersion: number;
  incrementConfigGraphVersion: () => void;

  // Increments each time a machine is loaded from the editor.
  machineLoadVersion: number;

  lastTransitionTrigger: number;
  triggerTransition: () => void;

  //This is for handling the colors of the states
  stateColorMatching: Map<string, string>; //Maps state names to colors
  setStateColorMatching: (stateColorMatching: Map<string, string>) => void;

  lastConfig: Configuration | null;
  setLastConfig: (config: Configuration | null) => void;

  pendingRunChoice: PendingRunChoice | null;
  setPendingRunChoice: (pendingRunChoice: PendingRunChoice | null) => void;
  setPendingRunChoiceState: (state: string | null) => void;
  runChoiceHighlightedTMEdges: string[];
  setRunChoiceHighlightedTMEdges: (edgeIds: string[]) => void;
  clearRunChoice: () => void;

  reset: () => void;
}

export const useGlobalZustand = create<GlobalZustand>((set) => ({
  setAll: (states, startState, transitions, blank, numberOfTapes, configGraph) => {
    set(prev => ({
      blank,
      numberOfTapes,
      runningLive: false,
      runningLiveID: 0,
      lastState: '',
      lastTransition: -1,
      states,
      configGraph,
      startState,
      transitions,
      tapes: Array.from({ length: numberOfTapes }, () => [[], []]),
      currentState: startState,
      heads: Array(numberOfTapes).fill(0),
      running: false,
      input: Array.from({ length: numberOfTapes }, () => [[], []]),
      stateColorMatching: getColorMatching(states, prev.stateColorMatching),
      lastConfig: null,
      pendingRunChoice: null,
      runChoiceHighlightedTMEdges: [],
      machineLoadVersion: prev.machineLoadVersion + 1,
    }));
  },

  configGraph: null,
  setConfigGraph: (configGraph) => set({ configGraph }),

  states: new Set<string>(),
  setStates: (states) => set({ states }),

  startState: '',
  setStartState: (state) => set({ startState: state }),

  currentState: '',
  setCurrentState: (state) => set({ currentState: state }),

  transitions: new Map<string, Transition[]>(),
  setTransitions: (transitions) => set({ transitions }),

  numberOfTapes: 1,
  setNumberOfTapes: (numberOfTapes) => set({ numberOfTapes }),

  blank: ' ',
  setBlank: (blank) => set({ blank }),

  tapes: [[[], []]],
  setTapes: (tapes) => set({ tapes }),

  heads: [0],
  setHeads: (heads) => set({ heads }),

  running: false,
  setRunning: (running) => set({ running }),

  runningLive: false,
  setRunningLive: (runningLive) => set({ runningLive }),

  runningLiveID: 0,
  incrementRunningLiveID: () =>
    set((state) => ({ runningLiveID: state.runningLiveID + 1 })),

  input: [[[], []]],
  setInput: (input) => set({ input }),

  lastState: '',
  setLastState: (state) => set({ lastState: state }),

  lastTransition: -1,
  setLastTransition: (transition) => set({ lastTransition: transition }),

  configGraphVersion: 0,
  incrementConfigGraphVersion: () =>
    set((state) => ({ configGraphVersion: state.configGraphVersion + 1 })),

  machineLoadVersion: 0,

  lastTransitionTrigger: 0,
  triggerTransition: () =>
    set((state) => ({ lastTransitionTrigger: state.lastTransitionTrigger + 1 })),

  stateColorMatching: new Map<string, string>(),
  setStateColorMatching: (stateColorMatching) => set({ stateColorMatching: stateColorMatching }),

  pendingRunChoice: null,
  setPendingRunChoice: (pendingRunChoice) => set({ pendingRunChoice }),
  setPendingRunChoiceState: (state) =>
    set((s) => {
      if (!s.pendingRunChoice) return {};
      return { pendingRunChoice: { ...s.pendingRunChoice, selectedState: state } };
    }),
  runChoiceHighlightedTMEdges: [],
  setRunChoiceHighlightedTMEdges: (edgeIds) => set({ runChoiceHighlightedTMEdges: edgeIds }),
  clearRunChoice: () =>
    set({
      pendingRunChoice: null,
      runChoiceHighlightedTMEdges: [],
    }),

  reset: () =>
    set({
      states: new Set<string>(),
      startState: '',
      currentState: '',
      transitions: new Map<string, Transition[]>(),
      blank: ' ',
      tapes: [[[], []]],
      numberOfTapes: 1,
      heads: [0],
      running: false,
      runningLive: false,
      configGraph: null,
      lastState: '',
      lastTransition: -1,
      input: [[[], []]],
      stateColorMatching: new Map<string, string>(),
      lastConfig: null,
      pendingRunChoice: null,
      runChoiceHighlightedTMEdges: [],
      machineLoadVersion: 0,
    }),

  lastConfig: null,
  setLastConfig: (config) => set({ lastConfig: config }),

}));
