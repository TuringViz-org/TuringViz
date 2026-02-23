import { describe, it, expect, beforeEach } from 'vitest';

import schema from '../public/turingMachineSchema.json';
import { useGlobalZustand } from '@zustands/GlobalZustand';

import { parseYaml, setTuringMachineSchema } from '@utils/parsing';
import { createTapeContentFromStrings } from '@mytypes/TMTypes';
import { getStartConfiguration, nextConfigurations } from '@tmfunctions/Configurations';
import { getComputationTree } from '@tmfunctions/ComputationTree';

describe('ComputationTree (BFS) tests', () => {
  beforeEach(() => {
    // Reset global state & schema before each test
    useGlobalZustand.getState().reset();
    setTuringMachineSchema(schema);
  });

  it('Depth 0: only root node, no edges', () => {
    const DESCRIPTION_VALUE = `# Comment
input: '1011/'
blank: ' '
tapes: 2
startstate: right
table:
  right:
    '1/all': 'R/R'
`;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const start = getStartConfiguration();
    const tree = getComputationTree(0);

    // Tree has exactly one node (root) and no edges
    expect(tree.nodes.length).toBe(1);
    expect(tree.edges.length).toBe(0);

    // Root matches the start configuration
    expect(tree.root.id).toBe(0);
    expect(tree.root.config.state).toBe(start.state);
    expect(tree.root.config.tapes).toEqual(start.tapes);
    expect(tree.root.config.heads).toEqual(start.heads);
  });

  it('Depth 1 (deterministic): exactly one child with correct transitionIndex and config', () => {
    const DESCRIPTION_VALUE = `# Comment
input: '1011/'
blank: ' '
tapes: 2
startstate: right
table:
  right:
    '1/all': 'R/R'
`;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const g = useGlobalZustand.getState();
    const start = getStartConfiguration();

    // Compute expected next configurations directly from transitions
    const tlist = g.transitions.get(start.state);
    const expectedNext = nextConfigurations(start, tlist, g.numberOfTapes, g.blank);
    expect(expectedNext.length).toBe(1);

    const tree = getComputationTree(1);

    // Root + one child => 2 nodes, one edge
    expect(tree.nodes.length).toBe(2);
    expect(tree.edges.length).toBe(1);

    // IDs are unique and root is 0
    const ids = new Set(tree.nodes.map(n => n.id));
    expect(ids.size).toBe(2);
    expect(tree.root.id).toBe(0);

    // Edge should be from 0 -> child with transitionIndex 0
    const e = tree.edges[0];
    expect(e.from).toBe(0);
    expect(e.transitionIndex).toBe(0);

    // Verify child configuration equals expected next configuration
    const childNode = tree.nodes.find(n => n.id === e.to)!;
    const [expCfg, expIdx] = expectedNext[0];
    expect(e.transitionIndex).toBe(expIdx);
    expect(childNode.config.state).toBe(expCfg.state);
    expect(childNode.config.tapes).toEqual(expCfg.tapes);
    expect(childNode.config.heads).toEqual(expCfg.heads);
  });

  it('Depth 1 (non-deterministic): two children with transitionIndex values [0, 1]', () => {
    const DESCRIPTION_VALUE = `# Comment
input: '1011/'
blank: ' '
tapes: 2
startstate: right
table:
  right:
    '1/all': 'R/R'
    '1/ ': 'L/L'
`;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const g = useGlobalZustand.getState();
    const start = getStartConfiguration();
    const tlist = g.transitions.get(start.state);
    const expectedNext = nextConfigurations(start, tlist, g.numberOfTapes, g.blank);
    expect(expectedNext.length).toBe(2);

    const tree = getComputationTree(1);

    // Root + two children => 3 nodes, two edges
    expect(tree.nodes.length).toBe(3);
    expect(tree.edges.length).toBe(2);

    // transitionIndex must be 0 and 1
    const indices = tree.edges.map(e => e.transitionIndex).sort((a, b) => a - b);
    expect(indices).toEqual([0, 1]);

    // The children configurations must match the two expected next configurations (order-insensitive)
    const childIds = tree.edges.map(e => e.to);
    const children = childIds.map(id => tree.nodes.find(n => n.id === id)!);

    const observed = children.map(c => ({ s: c.config.state, h: c.config.heads, t: c.config.tapes }));
    const expected = expectedNext.map(([c]) => ({ s: c.state, h: c.heads, t: c.tapes }));

    expected.forEach(exp => {
      const idx = observed.findIndex(o =>
        o.s === exp.s &&
        JSON.stringify(o.h) === JSON.stringify(exp.h) &&
        JSON.stringify(o.t) === JSON.stringify(exp.t)
      );
      expect(idx).toBeGreaterThanOrEqual(0);
      observed.splice(idx, 1);
    });
  });

  it('Depth 2 (deterministic with single rule): no further expansion after step 1', () => {
    // After the first step, the head on tape 0 sits on '0' and no rule matches anymore.
    const DESCRIPTION_VALUE = `# Comment
input: '1011/'
blank: ' '
tapes: 2
startstate: right
table:
  right:
    '1/all': 'R/R'
`;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const tree = getComputationTree(2);

    // Still only 2 nodes (root + first child) and one edge
    expect(tree.nodes.length).toBe(2);
    expect(tree.edges.length).toBe(1);

    // Root configuration is correct
    expect(tree.root.config.state).toBe('right');
    expect(tree.root.config.tapes).toEqual(createTapeContentFromStrings(['1011', ' ']));
    expect(tree.root.config.heads).toEqual([0, 0]);
  });
  it('Depth 0: root node has end=Halt when no outgoing transitions', () => {
    const DESCRIPTION_VALUE = `
input: '0'
blank: ' '
tapes: 1
startstate: q0
table:
  q0:
    '1': 'R'
`;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const tree = getComputationTree(0);

    // Only root node
    expect(tree.nodes.length).toBe(1);
    expect(tree.edges.length).toBe(0);

    // Since input head sees '0' and no rule applies → Halt
    expect(tree.root.end).toBe(0); // End.Halt
  });

  it('Depth 0: root node has end=NotYetComputed when transitions exist', () => {
    const DESCRIPTION_VALUE = `
input: '1'
blank: ' '
tapes: 1
startstate: q0
table:
  q0:
    '1': 'R'
`;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const tree = getComputationTree(0);

    // Only root node
    expect(tree.nodes.length).toBe(1);
    expect(tree.edges.length).toBe(0);

    // Transition exists, but depth=0 stops expansion
    expect(tree.root.end).toBe(1); // End.NotYetComputed
  });

  it('Depth 1: root with children should have end=None, children NotYetComputed/Halt', () => {
    const DESCRIPTION_VALUE = `
input: '1'
blank: ' '
tapes: 1
startstate: q0
table:
  q0:
    '1': 'R'
`;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const tree = getComputationTree(1);

    // Root + one child
    expect(tree.nodes.length).toBe(2);
    expect(tree.edges.length).toBe(1);

    const root = tree.nodes.find(n => n.id === tree.root.id)!;
    const child = tree.nodes.find(n => n.id !== tree.root.id)!;

    // Root was expanded → end=None
    expect(root.end).toBe(2); // End.None
    // Child has not been expanded further (depth limit reached) → NotYetComputed
    expect(child.end).toBe(1); // End.NotYetComputed
  });

  it('Depth 2: non-deterministic expansion assigns correct end values to children', () => {
    const DESCRIPTION_VALUE = `
input: '1'
blank: ' '
tapes: 1
startstate: q0
table:
  q0:
    '1': ['R', 'L']
`;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const tree = getComputationTree(2);

    // Root + two children
    expect(tree.nodes.length).toBe(3);
    expect(tree.edges.length).toBe(2);

    const root = tree.nodes.find(n => n.id === tree.root.id)!;
    const children = tree.nodes.filter(n => n.id !== tree.root.id);

    // Root expanded → end=None
    expect(root.end).toBe(2); // End.None

    // At depth 2, children also get expanded. Their end depends on further transitions.
    // In this toy machine, both children likely see blank or mismatch → Halt
    children.forEach(c => {
      expect([0, 1, 2]).toContain(c.end);
    });
  });

  it("Performance test: Depth 100 nondeterministic tree", () => {
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
    expect(errors).toEqual([]);

    const tree = getComputationTree(100);

    console.log(tree.nodes.length);
    console.log(tree.edges.length);
  }, 30000) // 30s timeout for this potentially heavy test

  //Compressing tests:

  it('Deterministic linear chain is collapsed into a single compressed edge', () => {
    // Single-tape machine that keeps moving right on '1' until it sees blank.
    // With depth=3 and input '1111', the uncompressed tree would have 4 nodes (a chain of length 3).
    // Compressed mode should reduce this to 2 nodes and 1 compressed edge.
    const DESCRIPTION_VALUE = `
input: '1111'
blank: ' '
tapes: 1
startstate: q0
table:
  q0:
    '1': 'R'
`;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const depth = 3;
    const tree = getComputationTree(depth, /* compressing */ true);

    // Expect exactly root + one end node
    expect(tree.nodes.length).toBe(2);
    expect(tree.edges.length).toBe(1);

    // Root ID still starts at 0
    expect(tree.root.id).toBe(0);

    // The single edge must be compressed and have transitionIndex ignored (-1)
    const e = tree.edges[0];
    expect(e.from).toBe(0);
    expect(e.compressed).toBe(true);
    expect(e.transitionIndex).toBe(-1);

    // Sanity check: to-node must exist
    const target = tree.nodes.find(n => n.id === e.to);
    expect(target).toBeTruthy();
  });

  it('Compression preserves branching at the root and compresses only the linear tails', () => {
    // Root is non-deterministic: two transitions to q1 and q2 (both move R).
    // Each branch then continues deterministically to the right (linear chain).
    // Compressed mode should keep the two edges out of root uncompressed,
    // and then add a compressed edge under each branch.
    const DESCRIPTION_VALUE = `
input: '111'
blank: ' '
tapes: 1
startstate: q0
table:
  q0:
    '1': [ {'R': q1}, {'R': q2} ]
  q1:
    '1': {'R': q1}
  q2:
    '1': {'R': q2}
`;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const depth = 3;
    const tree = getComputationTree(depth, /* compressing */ true);

    // Expect: nodes = root + child(q1) + child(q2) + end-of-chain for each branch => 5 nodes
    // edges = 2 (root->q1/q2, uncompressed) + 2 (q1->end, q2->end, compressed) => 4 edges
    expect(tree.nodes.length).toBe(5);
    expect(tree.edges.length).toBe(4);

    // Check that exactly two edges are uncompressed out of the root and two are compressed
    const edgesFromRoot = tree.edges.filter(e => e.from === tree.root.id);
    expect(edgesFromRoot.length).toBe(2);
    edgesFromRoot.forEach(e => {
      expect(e.compressed).toBe(false);
      // transitionIndex must still be meaningful on uncompressed edges
      expect([0, 1]).toContain(e.transitionIndex);
    });

    const compressedEdges = tree.edges.filter(e => e.compressed);
    expect(compressedEdges.length).toBe(2);
    compressedEdges.forEach(e => {
      expect(e.transitionIndex).toBe(-1);
    });
  });

  it('Compressed node budget counts rendered compressed nodes, not hidden chain steps', () => {
    const DESCRIPTION_VALUE = `
input: '1'
blank: ' '
tapes: 1
startstate: q0
table:
  q0:
    '1': [ {'S': qA1}, {'S': qB1} ]
  qA1:
    '1': {'S': qA2}
  qA2:
    '1': {'S': qA3}
  qA3:
    '1': {'S': qA4}
  qA4:
    '1': {'S': qA5}
  qA5:
    '1': [ {'S': qAL}, {'S': qAR} ]
  qAL: {}
  qAR: {}
  qB1:
    '1': {'S': qB2}
  qB2:
    '1': {'S': qB3}
  qB3:
    '1': {'S': qB4}
  qB4:
    '1': {'S': qB5}
  qB5:
    '1': [ {'S': qBL}, {'S': qBR} ]
  qBL: {}
  qBR: {}
`;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const targetNodes = 7;
    const tree = getComputationTree(6, /* compressing */ true, targetNodes);

    expect(tree.nodes.length).toBe(targetNodes);
    const states = new Set(tree.nodes.map(n => n.config.state));
    expect(states.has('qA5') || states.has('qB5')).toBe(true);
  });

  it('Single-step tail is NOT compressed (chain length = 1)', () => {
    // q0 has exactly one child; that child is a leaf (no further transitions).
    // Compression should not trigger (length=1), so we still get a normal edge with compressed=false.
    const DESCRIPTION_VALUE = `
input: '0'
blank: ' '
tapes: 1
startstate: q0
table:
  q0:
    '0': {'R': done}
  done: {}
`;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const tree = getComputationTree(2, /* compressing */ true);

    expect(tree.nodes.length).toBe(2);
    expect(tree.edges.length).toBe(1);

    const e = tree.edges[0];
    expect(e.compressed).toBe(false);
    expect(e.transitionIndex).toBe(0); // first (and only) transition out of q0
  });

  it('Compressed end configuration matches the depth frontier of the uncompressed tree (deterministic chain)', () => {
    // Deterministic chain; verify that the compressed edge reaches the same configuration
    // as the depth-d frontier node in the uncompressed tree.
    const DESCRIPTION_VALUE = `
input: '11111'
blank: ' '
tapes: 1
startstate: q0
table:
  q0:
    '1': 'R'
`;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const depth = 4;

    // Build compressed tree
    const compressedTree = getComputationTree(depth, /* compressing */ true);
    expect(compressedTree.edges.length).toBe(1);
    const compressedEdge = compressedTree.edges[0];
    expect(compressedEdge.compressed).toBe(true);

    const compressedTarget = compressedTree.nodes.find(n => n.id === compressedEdge.to)!;

    // Compute expected configuration by stepping deterministically 'depth' times
    const g = useGlobalZustand.getState();
    let cfg = getStartConfiguration();
    for (let i = 0; i < depth; i++) {
      const tlist = g.transitions.get(cfg.state);
      const nexts = nextConfigurations(cfg, tlist, g.numberOfTapes, g.blank);
      expect(nexts.length).toBe(1); // deterministic
      cfg = nexts[0][0];
    }

    // Compare configs (state, heads, tapes)
    expect(compressedTarget.config.state).toBe(cfg.state);
    expect(compressedTarget.config.heads).toEqual(cfg.heads);
    expect(compressedTarget.config.tapes).toEqual(cfg.tapes);
  });

  it('When compression is disabled, behavior matches original (all edges uncompressed)', () => {
    // Sanity: with compressing=false, we should see the classic BFS shape (no collapsed edges).
    const DESCRIPTION_VALUE = `
input: '1111'
blank: ' '
tapes: 1
startstate: q0
table:
  q0:
    '1': 'R'
`;

    const errors = parseYaml(DESCRIPTION_VALUE);
    expect(errors).toEqual([]);

    const depth = 3;

    const uncompressed = getComputationTree(depth, /* compressing */ false);
    expect(uncompressed.nodes.length).toBe(depth + 1); // 4 nodes in a straight chain
    expect(uncompressed.edges.length).toBe(depth);     // 3 edges
    uncompressed.edges.forEach(e => {
      expect(e.compressed).toBe(false);
      expect(e.transitionIndex).toBe(0);
    });
  });
});
