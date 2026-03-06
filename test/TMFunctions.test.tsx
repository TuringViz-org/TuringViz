import { describe, it, expect, beforeEach } from 'vitest';

import { useGlobalZustand} from '@zustands/GlobalZustand';

import schema from '../public/turingMachineSchema.json';

import {isDeterministic} from '@tmfunctions/DetDetection';
import { parseYaml, setTuringMachineSchema } from '@utils/parsing';
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
    setTuringMachineSchema(schema);
  });

  it('DetDetection false', () => {
    const DESCRIPTION_VALUE = `# Comment
input: '1011/'
blank: ' '
tapes: 2 #Number of tapes
startstate: right
table:
    # This is a comment
    right:
        '1/all': 'R/R'
        '0/ ': 'R/R'
        '[ / , 1/5]': {'L/L': left} 
    left:
        '1/ ': {write: '1/same', 'R/S': right}
    done: {}
    `;

    const errors = parseYaml(DESCRIPTION_VALUE);

    expect(errors).toEqual([]);

    // Check if the state is set correctly
    const state = useGlobalZustand.getState();

    // Check states
    expect(isDeterministic(state.transitions).result).toEqual(false);
    console.log(isDeterministic(state.transitions).conflictingTransitions);
  });

  it('DetDetection true', () => {
    const DESCRIPTION_VALUE = `# Comment
input: '1011/'
blank: ' '
tapes: 2 #Number of tapes
startstate: right
table:
    # This is a comment
    right:
        '1/all': 'R/R'
        '0/ ': 'R/R'
        #'[ / , 1/5]': {'L/L': left} 
    left:
        '1/ ': {write: '1/same', 'R/S': right}
    done: {}
    `;

    const errors = parseYaml(DESCRIPTION_VALUE);

    expect(errors).toEqual([]);

    // Check if the state is set correctly
    const state = useGlobalZustand.getState();

    // Check states
    expect(isDeterministic(state.transitions).result).toEqual(true);
    console.log(isDeterministic(state.transitions).conflictingTransitions);
  });

  it('NextConfig-Det', () => {
    const DESCRIPTION_VALUE = `# Comment
input: '1011/'
blank: ' '
tapes: 2 #Number of tapes
startstate: right
table:
    # This is a comment
    right:
        '1/all': 'R/R'
    `;

    const errors = parseYaml(DESCRIPTION_VALUE);
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
    console.log("Successfully executed nextConfigurations test with result:", nextConfigs[0]);
  })

  it('NextConfig-NonDet', () => {
    const DESCRIPTION_VALUE = `# Comment
input: '1011/'
blank: ' '
tapes: 2 #Number of tapes
startstate: right
table:
    # This is a comment
    right:
        '1/all': 'R/R'
        '1/ ': 'L/L'
    `;

    const errors = parseYaml(DESCRIPTION_VALUE);
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
    console.log("Successfully executed nextConfigurations test with result:", nextConfigs);

  })

  it('getStartConfiguration', () => {
    const DESCRIPTION_VALUE = `# Comment
input: '1011/'
blank: ' '
tapes: 2 #Number of tapes
startstate: right
table:
    right:
        '1/all': 'R/R'
  `;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const startConfig = getStartConfiguration();

    expect(startConfig).toBeDefined();
    expect(startConfig.state).toEqual('right');
    expect(startConfig.tapes).toEqual(createTapeContentFromStrings(['1011', ' ']));
    expect(startConfig.heads).toEqual([0, 0]);
  });

  it("DAG ConfigGraph", () => {
    const errors = parseYaml(DAG.code);
    expect(errors).toEqual([]);
  })

  it("Circle ConfigGraph", () => {
    const errors = parseYaml(Circle.code);
    expect(errors).toEqual([]);
  })

  it("Performance test: Depth 100 config graph, ndtm", () => {
    const DESCRIPTION_VALUE =
      "#Generating all possible strings of given length, consisting of 0's and 1's\n" +
      'tapes: 1\n' +
      'input: "00000000000000"  #length 14 \n' +
      'blank: " "\n' +
      'startstate: generate\n' +
      'table:\n' +
      '    generate: \n' +
      '        "0": [{write: "0", "R"}, {write: "1", "R"}]\n' +
      '        " ": {"S": done}\n' +
      '    done: {}';

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]); //until here: 351ms at depth 10

    const graph = computeConfigGraph(getStartConfiguration(), 50000, useGlobalZustand.getState().transitions, useGlobalZustand.getState().numberOfTapes, useGlobalZustand.getState().blank);

  }, 30000) // 30s timeout for this potentially heavy test. Takes 7.5 secs with object-hash
});
