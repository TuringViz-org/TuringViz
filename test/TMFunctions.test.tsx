import { describe, it, expect, beforeEach } from 'vitest';

import { useGlobalZustand} from '@zustands/GlobalZustand';


import {isDeterministic} from '@tmfunctions/DetDetection';
import { loadTuringMachineFromSource } from '@tmLanguage/loadMachine';
import {
  getCurrentConfiguration,
  nextConfigurationsFromState,
  getStartConfiguration,
} from '@tmfunctions/Configurations';
import { createTapeContentFromStrings } from '@mytypes/TMTypes';
import { Circle, DAG } from '@utils/ExampleTMs';
import { computeConfigGraph } from '@tmfunctions/ConfigGraph';

describe('TMFunctions tests', () => {
  beforeEach(() => {
    useGlobalZustand.getState().reset();
  });

  it('DetDetection false', () => {
    const DESCRIPTION_VALUE = `tapes: 2
blank: " "
input: "0" | ""
start: right

state right:
  on 1/* -> move R/R;
  on 1/" " -> move L/L; goto left;

state left:
  on 1/" " -> write 1/same; move R/S; goto right;

state done:`;

    const errors = loadTuringMachineFromSource(DESCRIPTION_VALUE);

    expect(errors).toEqual([]);

    // Check if the state is set correctly
    const state = useGlobalZustand.getState();

    // Check states
    const deterministic = isDeterministic(state.transitions);
    expect(deterministic.result).toEqual(false);
    expect(deterministic.conflictingTransitions.length).toBe(2);
  });

  it('DetDetection true', () => {
    const DESCRIPTION_VALUE = `tapes: 2
blank: " "
input: "1011" | ""
start: right

state right:
  on 1/* -> move R/R;
  on 0/" " -> move R/R;

state left:
  on 1/" " -> write 1/same; move R/S; goto right;

state done:`;

    const errors = loadTuringMachineFromSource(DESCRIPTION_VALUE);

    expect(errors).toEqual([]);

    // Check if the state is set correctly
    const state = useGlobalZustand.getState();

    // Check states
    const deterministic = isDeterministic(state.transitions);
    expect(deterministic.result).toEqual(true);
    expect(deterministic.conflictingTransitions).toEqual([]);
  });

  it('NextConfig-Det', () => {
    const DESCRIPTION_VALUE = `tapes: 2
blank: " "
input: "1011" | ""
start: right

state right:
  on 1/* -> move R/R;`;

    const errors = loadTuringMachineFromSource(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const config = getCurrentConfiguration();
    expect(config).toBeDefined();

    expect(config.state).toEqual('right');
    expect(config.tapes).toEqual(createTapeContentFromStrings(["1011", " "]));

    expect(config.heads).toEqual([0, 0]);

    const nextConfigs = nextConfigurationsFromState(config);
    expect(nextConfigs.length).toEqual(1);
    const nextConfig = nextConfigs[0][0];
    const transitionIndex = nextConfigs[0][1];
    expect(transitionIndex).toEqual(0);
    expect(nextConfig.state).toEqual('right');
    expect(nextConfig.tapes).toEqual(createTapeContentFromStrings(["1011", "  "]));
    expect(nextConfig.heads).toEqual([1, 1]);
  })

  it('NextConfig-NonDet', () => {
    const DESCRIPTION_VALUE = `tapes: 2
blank: " "
input: "1011" | ""
start: right

state right:
  on 1/* -> move R/R;
  on 1/" " -> move L/L;`;

    const errors = loadTuringMachineFromSource(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const config = getCurrentConfiguration();
    expect(config).toBeDefined();

    expect(config.state).toEqual('right');
    expect(config.tapes).toEqual(createTapeContentFromStrings(["1011", " "]));

    expect(config.heads).toEqual([0, 0]);

    const nextConfigs = nextConfigurationsFromState(config);
    expect(nextConfigs.length).toEqual(2);
    const nextConfig = nextConfigs[0][0];
    const transitionIndex = nextConfigs[0][1];
    expect(transitionIndex).toEqual(0);
    expect(nextConfig.state).toEqual('right');
    expect(nextConfig.tapes).toEqual(createTapeContentFromStrings(["1011", "  "]));
    expect(nextConfig.heads).toEqual([1, 1]);

    const nextConfig2 = nextConfigs[1][0];
    const transitionIndex2 = nextConfigs[1][1];
    expect(transitionIndex2).toEqual(1);
    expect(nextConfig2.state).toEqual('right');
    expect(nextConfig2.tapes).toEqual([
      [[{value: " "}], [{ value: '1' }, { value: '0' }, { value: '1' }, { value: '1' }]],
      [[{value: " "}], [{ value: ' ' }]]
    ]);
    expect(nextConfig2.heads).toEqual([-1, -1]);
  })

  it('getStartConfiguration', () => {
    const DESCRIPTION_VALUE = `tapes: 2
blank: " "
input: "1011" | ""
start: right

state right:
  on 1/* -> move R/R;`;

    const errors = loadTuringMachineFromSource(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const startConfig = getStartConfiguration();

    expect(startConfig).toBeDefined();
    expect(startConfig.state).toEqual('right');
    expect(startConfig.tapes).toEqual(createTapeContentFromStrings(['1011', ' ']));
    expect(startConfig.heads).toEqual([0, 0]);
  });

  it("DAG ConfigGraph", () => {
    const errors = loadTuringMachineFromSource(DAG.code);
    expect(errors).toEqual([]);
  })

  it("Circle ConfigGraph", () => {
    const errors = loadTuringMachineFromSource(Circle.code);
    expect(errors).toEqual([]);
  })

  it("Performance test: Depth 100 config graph, ndtm", () => {
    const DESCRIPTION_VALUE = `tapes: 1
blank: " "
input: "00000000"
start: generate

state generate:
  on 0 -> choose {
    write 0; move R;
    write 1; move R;
  }
  on " " -> move S; goto done;

state done:`;

    const errors = loadTuringMachineFromSource(DESCRIPTION_VALUE);
    expect(errors).toEqual([]); //until here: 351ms at depth 10

    const graph = computeConfigGraph(getStartConfiguration(), 5000, useGlobalZustand.getState().transitions, useGlobalZustand.getState().numberOfTapes, useGlobalZustand.getState().blank);
    expect(graph.Graph.size).toBeGreaterThan(0);

  }, 30000) // 30s timeout for this potentially heavy test. Takes 7.5 secs with object-hash
});
