import { describe, expect, it } from 'vitest';

import { buildSinglePathLayout } from '@components/shared/layout/singlePathLayout';

describe('buildSinglePathLayout', () => {
  const nodes = [
    { id: 'a', width: 10, height: 10 },
    { id: 'b', width: 10, height: 10 },
    { id: 'c', width: 10, height: 10 },
  ];

  const edges = [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
  ];

  it('creates manual positions for a linear path', () => {
    const positions = buildSinglePathLayout(nodes, edges, {
      direction: 'RIGHT',
      padding: 24,
      nodeSep: 70,
      rankSep: 120,
      edgeSep: 24,
      edgeNodeSep: 100,
    });

    expect(positions).not.toBeNull();
    expect(positions?.get('a')).toEqual({ x: 24, y: 24 });
    expect(positions?.get('b')).toEqual({ x: 203, y: 24 });
    expect(positions?.get('c')).toEqual({ x: 382, y: 24 });
  });

  it('reverses visual order for LEFT direction', () => {
    const positions = buildSinglePathLayout(nodes, edges, {
      direction: 'LEFT',
      padding: 24,
      nodeSep: 70,
      rankSep: 120,
      edgeSep: 24,
      edgeNodeSep: 100,
    });

    expect((positions?.get('a')?.x ?? 0) > (positions?.get('b')?.x ?? 0)).toBe(true);
    expect((positions?.get('b')?.x ?? 0) > (positions?.get('c')?.x ?? 0)).toBe(true);
  });

  it('returns null when the graph branches', () => {
    const branching = buildSinglePathLayout(
      nodes,
      [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'c' },
      ],
      {
        direction: 'RIGHT',
        padding: 24,
        nodeSep: 70,
        rankSep: 120,
        edgeSep: 24,
        edgeNodeSep: 100,
      }
    );

    expect(branching).toBeNull();
  });

  it('applies separation options to distance between nodes', () => {
    const wide = buildSinglePathLayout(nodes, edges, {
      direction: 'RIGHT',
      padding: 24,
      nodeSep: 120,
      rankSep: 200,
      edgeSep: 40,
      edgeNodeSep: 160,
    });
    const tight = buildSinglePathLayout(nodes, edges, {
      direction: 'RIGHT',
      padding: 24,
      nodeSep: 10,
      rankSep: 20,
      edgeSep: 10,
      edgeNodeSep: 10,
    });

    const wideDistance = (wide?.get('b')?.x ?? 0) - (wide?.get('a')?.x ?? 0);
    const tightDistance = (tight?.get('b')?.x ?? 0) - (tight?.get('a')?.x ?? 0);
    expect(wideDistance > tightDistance).toBe(true);
  });
});
