import YAML, { isMap, isScalar, isSeq, Scalar, YAMLMap, YAMLSeq } from 'yaml'; // Added isSeq and YAMLSeq
import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  Move,
  isMove,
  Transition,
  TapeWrite,
  isTapeWriteRealField,
  isTapeWriteSameField,
  TapePattern,
  isTapePatternRealField,
  isTapePatternAllField,
  TapeContent,
  TapeContentField,
} from '@mytypes/TMTypes';

import Ajv from 'ajv';
import { computeConfigGraph } from '@tmfunctions/ConfigGraph';
import { computeConfigGraphInWorker } from './graphWorkerClient';
import { useGraphZustand } from '@zustands/GraphZustand';
import {
  DEFAULT_CONFIG_GRAPH_TARGET_NODES,
  MIN_CONFIG_GRAPH_TARGET_NODES,
} from './constants';

export type LineParseError = {
  message: string;
  linePos: number;
  startColumn: number;
  endColumn: number;
};

let schema: any = null;
let latestConfigGraphJobId = 0;
const INITIAL_CONFIG_GRAPH_NODES = 500;
const FULL_CONFIG_GRAPH_NODES = DEFAULT_CONFIG_GRAPH_TARGET_NODES;

// Loading the schema from the public folder. Call in main.tsx
export function setTuringMachineSchema(schema2: any) {
  schema = schema2;
}

export function isTuringMachineSchemaLoaded(): boolean {
  return Boolean(schema);
}

export function parseYaml(editorstring: string): LineParseError[] {
  if (!schema) {
    console.error('Schema is not set. Please call setTuringMachineSchema() before parsing.');
    return [];
  }

  const errors: LineParseError[] = [];

  const parsed = YAML.parse(editorstring);
  const ajv = new Ajv({ strict: false });
  const validate = ajv.compile(schema as any);
  const valid = validate(parsed);

  if (!valid) {
    alert(`YAML validation failed: ${JSON.stringify(validate.errors)}`);
    return [];
  }

  // Storing every state and when it occurs for underlining errors:
  const stateOccurences: Map<string, Array<[number, number, number]>> = new Map();

  // Here comes the YAML parse logic
  const lineCounter = new YAML.LineCounter();
  const parsedYaml = YAML.parseDocument(editorstring, { keepSourceTokens: true, lineCounter });

  const input = (parsedYaml.get('input') as string).split('/');
  const blank = parsedYaml.get('blank') as string;
  const numberOfTapes = parsedYaml.get('tapes') as number;
  const startState = parsedYaml.get('startstate') as string;
  const table = parsedYaml.get('table') as YAMLMap;

  // Make sure the start state is a real state --> Register it
  const offsetStart = (parsedYaml.get('startstate', true) as { range?: [number, number] })?.range?.[0] ?? 0;
  const offsetEnd = (parsedYaml.get('startstate', true) as { range?: [number, number] })?.range?.[1] ?? 0;
  const { line: lineStart, col: colStart } = lineCounter.linePos(offsetStart);
  const { line: lineEnd, col: colEnd } = lineCounter.linePos(offsetEnd);
  stateOccurences.set(startState, [[lineStart, colStart, colEnd]]);

  // Extract the states from the transition table keys
  const states = new Set<string>();
  table.items.forEach((item) => {
    const stateKey = (item.key as Scalar).value as string;
    states.add(stateKey);
  });

  // For each state, extract the transitions
  const transitions = new Map<string, Transition[]>();
  for (const state of states) {
    const stateMap = table.get(state) as YAMLMap | null;
    const items = stateMap && stateMap.items ? stateMap.items : [];
    const transitionList: Transition[] = [];
    const from = state; // The current state we are processing

    items.forEach((item) => {
      const key = (item.key as Scalar).value as string; // e.g. '1/0', '0/all', or "[1/0, /2]"
      const value = item.value; // either a YAMLMap, YAMLSeq, or Scalar ("R/L", "S/L", etc.)
      const write: TapeWrite = [];
      const direction: Move[] = [];
      const tapepatterns: TapePattern[] = [];
      let to = state; // Default transition target is the same state (self-loop) unless changed

      const patterns: string[] = [];
      // Check if the key is an array of patterns or a single pattern
      if (key.startsWith('[') && key.endsWith(']')) {
        // e.g. "[1/0, /2]" -> split into individual patterns
        const patternsHere = key.slice(1, -1).split(',').map((p) => p.trim());
        patterns.push(...patternsHere);
      } else {
        patterns.push(key);
      }

      // Build tape condition arrays for each pattern
      patterns.forEach((pattern) => {
        const tapePattern: TapePattern = [];
        pattern.split('/').forEach((symbol) => {
          symbol = symbol.trim();
          if (symbol === "") {
            symbol = " "; // interpret empty symbol as blank
          }
          if (isTapePatternRealField(symbol)) {
            tapePattern.push({ value: symbol });
          } else if (isTapePatternAllField(symbol)) {
            tapePattern.push({});
          }
        });
        tapepatterns.push(tapePattern);
      });

      // Determine the type of the transition value and process accordingly
      if (isSeq(value)) {
        // Handle nondeterministic transitions (sequence of possible actions)
        (value as YAMLSeq).items.forEach((elem) => {
          const writeSeq: TapeWrite = [];
          const directionSeq: Move[] = [];
          let toSeq = state; // default target state for this element is the current state
          if (isMap(elem)) {
            // Element is an object with possibly 'write', movement, and next state
            elem.items.forEach((subItem) => {
              const subKey = (subItem.key as Scalar).value as string;
              let subValue: string = '';
              if (isScalar(subItem.value)) {
                subValue = subItem.value.value as string;
              }
              if (subKey === 'write') {
                // Process write instructions, e.g. '0/1'
                subValue.split('/').forEach((symbol) => {
                  if (isTapeWriteRealField(symbol)) {
                    writeSeq.push({ value: symbol });
                  } else if (isTapeWriteSameField(symbol)) {
                    writeSeq.push({});
                  }
                });
              } else {
                // Process movement instructions and optional next state
                subKey.split('/').forEach((dir) => {
                  if (isMove(dir)) {
                    directionSeq.push(dir);
                  }
                });
                if (subValue !== '') {
                  // A next state is specified
                  toSeq = subValue.trim();
                  if (!stateOccurences.has(toSeq)) {
                    stateOccurences.set(toSeq, []);
                  }
                  const subOffsetStart = (subItem.value as { range?: [number, number] })?.range?.[0] ?? 0;
                  const subOffsetEnd = (subItem.value as { range?: [number, number] })?.range?.[1] ?? 0;
                  const { line: subLineStart, col: subColStart } = lineCounter.linePos(subOffsetStart);
                  const { line: subLineEnd, col: subColEnd } = lineCounter.linePos(subOffsetEnd);
                  stateOccurences.get(toSeq)?.push([subLineStart, subColStart, subColEnd]);
                }
              }
            });
            // If no explicit 'write' was provided, assume no change for all tapes
            if (writeSeq.length === 0) {
              writeSeq.push(...Array(numberOfTapes).fill({}));
            }
          } else if (isScalar(elem)) {
            // Element is a simple movement string (e.g. "R/L")
            const elemStr = (elem as Scalar).value as string;
            elemStr.trim().split('/').forEach((dir) => {
              if (isMove(dir)) {
                directionSeq.push(dir);
              } else {
                console.error(`Error: The direction ${dir} is not a valid move.`);
              }
            });
            // No write specified here, use default (no change) for all tapes
            writeSeq.push(...Array(numberOfTapes).fill({}));
          } else {
            console.error(`Error: Invalid sequence element type in state ${state} for key ${key}. Expected a map or scalar.`);
            return; // skip this element if format is invalid
          }
          // Add a transition for each tape pattern for this sequence element
          tapepatterns.forEach((tapePattern) => {
            transitionList.push({
              to: toSeq,
              from: from,
              write: writeSeq,
              tapecondition: tapePattern,
              direction: directionSeq,
            });
          });
        });
        // All transitions for this item have been added; skip further processing for this item
        return;
      }

      if (isMap(value)) {
        // Handle a transition described by a map (e.g. {write: '0/1', 'L/R': 'nextState'})
        (value.items as YAMLMap['items']).forEach((subItem) => {
          const subKey = (subItem.key as Scalar).value as string;
          let subValue: string = '';
          if (isScalar(subItem.value)) {
            subValue = subItem.value.value as string;
          }
          if (subKey === 'write') {
            // Write instructions for multiple tapes (e.g. '0/1' means write '0' on tape1, '1' on tape2)
            subValue.split('/').forEach((symbol) => {
              if (isTapeWriteRealField(symbol)) {
                write.push({ value: symbol });
              } else if (isTapeWriteSameField(symbol)) {
                write.push({});
              }
            });
          } else {
            // Movement directions and optional next state (subKey might be 'L/R' or 'S' etc.)
            subKey.split('/').forEach((dir) => {
              if (isMove(dir)) {
                direction.push(dir);
              }
            });
            if (subValue !== '') {
              // A next state is specified in this transition
              to = subValue.trim();
              if (!stateOccurences.has(to)) {
                stateOccurences.set(to, []);
              }
              const subOffsetStart = (subItem.value as { range?: [number, number] })?.range?.[0] ?? 0;
              const subOffsetEnd = (subItem.value as { range?: [number, number] })?.range?.[1] ?? 0;
              const { line: subLineStart, col: subColStart } = lineCounter.linePos(subOffsetStart);
              const { line: subLineEnd, col: subColEnd } = lineCounter.linePos(subOffsetEnd);
              stateOccurences.get(to)?.push([subLineStart, subColStart, subColEnd]);
            }
          }
        });
        // If no 'write' was specified in this transition, assume all tapes keep the same symbol
        if (write.length === 0) {
          write.push(...Array(numberOfTapes).fill({}));
        }
      } else if (isScalar(value)) {
        // Handle a transition described by a simple movement string (e.g. 'R/L')
        const valueStr = (value as Scalar).value as string;
        valueStr.trim().split('/').forEach((dir) => {
          if (isMove(dir)) {
            direction.push(dir);
          } else {
            console.error(`Error: The direction ${dir} is not a valid move.`);
          }
        });
        // No 'write' specified, so all tapes retain their symbols
        write.push(...Array(numberOfTapes).fill({}));
      } else {
        console.error(`Error: Unsupported value type for transition ${key} in state ${state}. Expected scalar, sequence, or map.`);
      }

      // After processing the transition, add it for each tape pattern
      tapepatterns.forEach((tapePattern) => {
        transitionList.push({
          to: to,
          from: from,
          write: write,
          tapecondition: tapePattern,
          direction: direction,
        });
      });
    });
    transitions.set(state, transitionList);
  }

  // Verify that every referenced state in transitions actually exists in the state set
  stateOccurences.forEach((occurrences, stateName) => {
    if (!states.has(stateName)) {
      occurrences.forEach(([linePos, startColumn, endColumn]) => {
        errors.push({
          message: `State not valid: ${stateName}`,
          linePos: linePos,
          startColumn: startColumn,
          endColumn: endColumn,
        });
      });
    }
  });

  // If any errors were detected, abort parsing and return errors (do not update global state)
  if (errors.length > 0) {
    return errors;
  }

  // Convert input strings to the internal TapeContent format for simulation
  const newinput: TapeContent = input.map((str) => {
    const left: TapeContentField[] = [];
    const right: TapeContentField[] = str.split("").map((symbol) => ({ value: symbol }));
    // If a tape's input string is empty, initialize it with a blank symbol
    if (str === "") {
      right.push({ value: blank });
    }
    return [left, right];
  });
  // If the number of provided input strings is less than numberOfTapes, pad with blank tape(s)
  while (newinput.length < numberOfTapes) {
    newinput.push([[], [{ value: blank }]]);
  }

  // Initialize the start configuration of the Turing machine
  const startConfig = {
    state: startState,
    tapes: newinput,
    heads: Array(numberOfTapes).fill(0), // all tape heads start at position 0
  };
  const configuredTargetNodes = Math.max(
    MIN_CONFIG_GRAPH_TARGET_NODES,
    useGraphZustand.getState().configGraphTargetNodes ?? FULL_CONFIG_GRAPH_NODES
  );
  const initialTargetNodes = Math.min(INITIAL_CONFIG_GRAPH_NODES, configuredTargetNodes);

  // Compute an initial configuration graph quickly on the main thread
  const initialConfigGraph = computeConfigGraph(
    startConfig,
    initialTargetNodes,
    transitions,
    numberOfTapes,
    blank
  );

  // Update the global state with the parsed machine definition and computed configurations
  useGlobalZustand
    .getState()
    .setAll(states, startState, transitions, blank, numberOfTapes, initialConfigGraph);
  useGlobalZustand.getState().setInput(newinput);
  useGlobalZustand.getState().setTapes(JSON.parse(JSON.stringify(newinput))); // store a deep copy of initial tape contents

  // Kick off a background job to expand the configuration graph without blocking the UI
  const jobId = ++latestConfigGraphJobId;
  computeConfigGraphInWorker({
    startConfig,
    transitions,
    numberOfTapes,
    blank,
    targetNodes: configuredTargetNodes,
  })
    .then((graph) => {
      if (jobId !== latestConfigGraphJobId) return; // newer parse supersedes this result
      const global = useGlobalZustand.getState();
      // Avoid applying stale data if the machine definition changed meanwhile
      if (global.startState !== startState) return;
      global.setConfigGraph(graph);
      global.incrementConfigGraphVersion();
    })
    .catch((err) => console.error('Config graph worker failed', err));

  return errors;
}
