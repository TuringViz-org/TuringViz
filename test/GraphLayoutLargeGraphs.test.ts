import { describe, expect, it } from 'vitest';
import {
  buildRecoveryLayout,
  getDefaultNodeLayoutSize,
} from '@components/shared/layout/graphLayout';
import { buildSinglePathLayout } from '@components/shared/layout/singlePathLayout';
import { MAX_COMPUTATION_TREE_TARGET_NODES } from '@utils/constants';

const count = MAX_COMPUTATION_TREE_TARGET_NODES;
const nodes = Array.from({ length: count }, (_, index) => ({
  id: String(index).padStart(6, '0'),
  position: { x: 0, y: 0 },
  data: {},
  width: 80,
  height: index === count - 1 ? 120 : 100,
}));
const spacing = {
  direction: 'RIGHT' as const,
  padding: 4,
  nodeSep: 0,
  rankSep: 30,
  edgeSep: 0,
  edgeNodeSep: 0,
};

describe('layout at the maximum graph budget', () => {
  it('positions a full path without passing its nodes as function arguments', () => {
    const edges = nodes.slice(1).map((node, index) => ({
      id: `edge-${index}`,
      source: nodes[index].id,
      target: node.id,
    }));
    const positions = buildSinglePathLayout(nodes, edges, spacing)!;
    expect(positions.size).toBe(count);
    expect(positions.get(nodes[0].id)).toEqual({ x: 4, y: 14 });
    expect(positions.get(nodes[count - 1].id)).toEqual({
      x: 4 + (count - 1) * 110,
      y: 4,
    });
  });

  it('retains the layered recovery layout for a full-width graph', () => {
    const positions = buildRecoveryLayout(
      nodes,
      [],
      spacing,
      getDefaultNodeLayoutSize
    );
    expect(positions.size).toBe(count);
    expect(positions.get(nodes[0].id)).toEqual({ x: 4, y: 4 });
    expect(positions.get(nodes[count - 1].id)).toEqual({
      x: 4,
      y: 4 + (count - 1) * 120,
    });
  });
});
