import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  buildElkGraph,
  buildRecoveryLayout,
  getDefaultNodeLayoutSize,
} from '@components/shared/layout/graphLayout';

const nodes: Node[] = [
  {
    id: 'a',
    position: { x: 0, y: 0 },
    data: {},
    measured: { width: 90, height: 80 },
  },
  { id: 'b', position: { x: 0, y: 0 }, data: {}, width: 50, height: 60 },
  { id: 'c', position: { x: 0, y: 0 }, data: {} },
  { id: 'd', position: { x: 0, y: 0 }, data: {} },
];
const edges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'ac', source: 'a', target: 'c' },
];
const spacing = {
  nodeSep: 70,
  rankSep: 120,
  edgeSep: 24,
  edgeNodeSep: 100,
  padding: 24,
};

describe('Graph layout geometry compatibility', () => {
  it('preserves ELK options, dimensions, node order and edge filtering', () => {
    const result = buildElkGraph(
      nodes,
      [
        ...edges,
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'parallel', source: 'a', target: 'b' },
        { id: 'self', source: 'c', target: 'c' },
        { id: 'missing', source: 'a', target: 'missing' },
      ],
      getDefaultNodeLayoutSize,
      { ...spacing, algorithm: 'layered', direction: 'DOWN' }
    );
    expect(result).toEqual({
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.spacing.nodeNode': '70',
        'elk.layered.spacing.nodeNodeBetweenLayers': '120',
        'elk.spacing.edgeEdge': '24',
        'elk.spacing.edgeNode': '100',
        'elk.padding': '24',
        'elk.direction': 'DOWN',
        'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      },
      children: [
        { id: 'a', width: 90, height: 80 },
        { id: 'b', width: 50, height: 60 },
        { id: 'c', width: 64, height: 64 },
        { id: 'd', width: 64, height: 64 },
      ],
      edges: [
        { id: 'ab', sources: ['a'], targets: ['b'] },
        { id: 'ac', sources: ['a'], targets: ['c'] },
        { id: 'parallel', sources: ['a'], targets: ['b'] },
      ],
    });
  });

  it.each([
    [
      'DOWN',
      [
        [24, 24],
        [24, 224],
        [184, 224],
        [184, 24],
      ],
    ],
    [
      'UP',
      [
        [24, 224],
        [24, 24],
        [184, 24],
        [184, 224],
      ],
    ],
    [
      'RIGHT',
      [
        [24, 24],
        [234, 24],
        [234, 174],
        [24, 174],
      ],
    ],
    [
      'LEFT',
      [
        [234, 24],
        [24, 24],
        [24, 174],
        [234, 174],
      ],
    ],
  ] as const)(
    'preserves fallback coordinates in direction %s',
    (direction, expected) => {
      const positions = buildRecoveryLayout(
        nodes,
        edges,
        { ...spacing, direction },
        getDefaultNodeLayoutSize
      );
      expect(nodes.map(({ id }) => positions.get(id))).toEqual(
        expected.map(([x, y]) => ({ x, y }))
      );
    }
  );
});
