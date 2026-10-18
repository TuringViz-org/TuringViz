import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  DEFAULT_CONFIG_GRAPH_TARGET_NODES,
  MIN_CONFIG_GRAPH_TARGET_NODES,
} from '@utils/constants';
import { computeConfigGraph } from '@tmfunctions/configGraphModel';
import { recomputeConfigGraphWithTargetNodes } from '@services/configGraphComputation';
import { useGraphZustand } from '@zustands/GraphZustand';
import {
  Move,
  type TapeContent,
  type TapeContentField,
  type TapePattern,
  type TapeWrite,
  type Transition,
} from '@mytypes/TMTypes';
import { parseTuringMachine } from './index';
import type { Diagnostic, MachineProgram, NormalizedTransition } from './types';

const INITIAL_CONFIG_GRAPH_NODES = 500;
const FULL_CONFIG_GRAPH_NODES = DEFAULT_CONFIG_GRAPH_TARGET_NODES;

export function loadTuringMachineFromSource(source: string): Diagnostic[] {
  const parsed = parseTuringMachine(source);
  const blockingDiagnostics = parsed.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error'
  );

  if (blockingDiagnostics.length > 0 || !parsed.machine) {
    return parsed.diagnostics;
  }

  loadMachineProgram(parsed.machine);
  return parsed.diagnostics;
}

function loadMachineProgram(machine: MachineProgram) {
  const transitions = convertTransitions(machine);
  const input = createInput(machine.input, machine.blank);
  const startConfig = {
    state: machine.start,
    tapes: input,
    heads: Array(machine.tapes).fill(0),
  };

  const configuredTargetNodes = Math.max(
    MIN_CONFIG_GRAPH_TARGET_NODES,
    useGraphZustand.getState().configGraphTargetNodes ?? FULL_CONFIG_GRAPH_NODES
  );
  const initialTargetNodes = Math.min(
    INITIAL_CONFIG_GRAPH_NODES,
    configuredTargetNodes
  );

  const initialConfigGraph = computeConfigGraph(
    startConfig,
    initialTargetNodes,
    transitions,
    machine.tapes,
    machine.blank
  );

  useGlobalZustand
    .getState()
    .setAll(
      new Set(machine.states),
      machine.start,
      transitions,
      machine.blank,
      machine.tapes,
      input,
      initialConfigGraph
    );

  if (import.meta.env.MODE === 'test') {
    return;
  }

  void recomputeConfigGraphWithTargetNodes(configuredTargetNodes);
}

function createInput(input: string[], blank: string): TapeContent {
  return input.map((segment) => {
    const right: TapeContentField[] =
      segment.length === 0
        ? [{ value: blank }]
        : Array.from(segment, (value) => ({ value }));
    return [[], right];
  });
}

function convertTransitions(machine: MachineProgram): Map<string, Transition[]> {
  const transitions = new Map<string, Transition[]>(
    machine.states.map((state) => [state, []])
  );

  for (const transition of machine.transitions) {
    const expandedConditions = expandReadPattern(transition.read);
    for (const tapecondition of expandedConditions) {
      const converted = convertTransition(transition, tapecondition);
      const list = transitions.get(converted.from);
      if (list) {
        list.push(converted);
      } else {
        transitions.set(converted.from, [converted]);
      }
    }
  }

  return transitions;
}

function expandReadPattern(read: NormalizedTransition['read']): TapePattern[] {
  return read.reduce<TapePattern[]>(
    (patterns, matcher) => {
      if (matcher === 'any') {
        return patterns.map((pattern) => [...pattern, {}]);
      }

      return patterns.flatMap((pattern) =>
        matcher.map((symbol) => [...pattern, { value: symbol }])
      );
    },
    [[]]
  );
}

function convertTransition(
  transition: NormalizedTransition,
  tapecondition: TapePattern
): Transition {
  return {
    from: transition.from,
    to: transition.to,
    tapecondition,
    write: convertWrite(transition.write),
    direction: transition.move.map((move) => Move[move]),
  };
}

function convertWrite(write: NormalizedTransition['write']): TapeWrite {
  return write.map((value) => (value === 'same' ? {} : { value }));
}
